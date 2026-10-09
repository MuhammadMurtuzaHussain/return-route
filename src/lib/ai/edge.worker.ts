/// <reference lib="webworker" />
// Gemma 4 E2B running on the phone itself: transformers.js + WebGPU, in a Web
// Worker so the page stays responsive. Weights download once from Hugging Face
// and live in the browser cache after that. Nothing this worker sees (the haul
// photo, the planner prompt) is sent anywhere.

import { AutoProcessor, Gemma4ForConditionalGeneration, RawImage, env } from "@huggingface/transformers";

type Inbound =
  | { type: "load"; model: string; dtype: "q4f16" | "q4" }
  | { type: "generate"; id: number; system: string; prompt: string; image?: Blob; maxTokens: number };

export type Outbound =
  | { type: "progress"; loaded: number; total: number; file?: string }
  | { type: "ready"; ms: number }
  | { type: "result"; id: number; text: string; ms: number }
  | { type: "error"; id?: number; message: string };

env.allowLocalModels = false;
env.useBrowserCache = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let processor: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;

const post = (m: Outbound) => (self as unknown as Worker).postMessage(m);

async function load(id: string, dtype: "q4f16" | "q4") {
  const t0 = performance.now();
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === "progress" && p.file && p.total) {
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: "progress", loaded, total, file: p.file });
    }
  };
  processor = await AutoProcessor.from_pretrained(id, { progress_callback });
  model = await Gemma4ForConditionalGeneration.from_pretrained(id, { dtype, device: "webgpu", progress_callback });
  post({ type: "ready", ms: Math.round(performance.now() - t0) });
}

async function generate(m: Extract<Inbound, { type: "generate" }>) {
  const t0 = performance.now();
  // Gemma's chat template has no separate system turn worth relying on in a
  // small model; the instructions go first in the user turn.
  const content: { type: string; text?: string }[] = [];
  if (m.image) content.push({ type: "image" });
  content.push({ type: "text", text: `${m.system}\n\n${m.prompt}` });
  const prompt = processor.apply_chat_template([{ role: "user", content }], { enable_thinking: false, add_generation_prompt: true });
  const image = m.image ? await RawImage.fromBlob(m.image) : null;
  const inputs = await processor(prompt, image, null, { add_special_tokens: false });
  const outputs = await model.generate({ ...inputs, max_new_tokens: m.maxTokens, do_sample: false });
  const decoded = processor.batch_decode(outputs.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true });
  post({ type: "result", id: m.id, text: decoded[0] ?? "", ms: Math.round(performance.now() - t0) });
}

self.onmessage = async (e: MessageEvent<Inbound>) => {
  const m = e.data;
  try {
    if (m.type === "load") await load(m.model, m.dtype);
    else if (m.type === "generate") {
      if (!model) throw new Error("Model not loaded");
      await generate(m);
    }
  } catch (err) {
    post({ type: "error", id: m.type === "generate" ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
