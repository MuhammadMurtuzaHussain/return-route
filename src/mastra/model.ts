import { createOllama } from "ollama-ai-provider-v2";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { Tier } from "@/lib/ai/schema";

// One switch decides where the server's Gemma runs. Same open weights either way:
//   ollama → on your own laptop; nothing leaves it.
//   google → Google AI Studio serving Gemma, for the hosted demo.
// (The third tier, Gemma on the phone itself, runs in the browser: src/lib/ai/edge.worker.ts.)

type ProviderOptions = {
  google?: { thinkingConfig: { thinkingLevel: "minimal" | "low" | "medium" | "high" } };
  ollama?: { think?: boolean; options?: { num_ctx?: number } };
};

export function getModelConfig() {
  const provider = (process.env.MODEL_PROVIDER ?? "ollama").toLowerCase();
  if (provider === "google") {
    const modelId = process.env.GOOGLE_MODEL ?? "gemma-4-26b-a4b-it";
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    // Gemma 4 thinks at length by default; picking three park benches does not need it.
    return {
      tier: "cloud" as Tier,
      modelId,
      model: google(modelId),
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } } as ProviderOptions,
    };
  }
  const modelId = process.env.OLLAMA_MODEL ?? "gemma4:e4b";
  const ollama = createOllama({ baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/api" });
  return {
    tier: "local" as Tier,
    modelId,
    model: ollama(modelId),
    providerOptions: { ollama: { think: false, options: { num_ctx: 8192 } } } as ProviderOptions,
  };
}
