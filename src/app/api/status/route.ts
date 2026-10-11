import { getModelConfig } from "@/mastra/model";
import { kvBackend } from "@/lib/server/kv";
import { sentryEnabled } from "@/lib/server/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { tier, modelId } = getModelConfig();
  let ready = true;
  if (tier === "local") {
    // Is Ollama up and is the model pulled?
    try {
      const base = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/api").replace(/\/$/, "");
      const tags = await fetch(`${base}/tags`, { cache: "no-store" }).then((r) => r.json());
      ready = (tags.models ?? []).some((m: { name: string }) => m.name === modelId || m.name === `${modelId}:latest`);
    } catch {
      ready = false;
    }
  } else {
    ready = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  }
  return Response.json({
    tier,
    model: modelId,
    ready,
    edgeModel: process.env.NEXT_PUBLIC_EDGE_MODEL ?? "onnx-community/gemma-4-E2B-it-ONNX",
    // Which optional services this server has switched on.
    services: { cache: kvBackend(), events: Boolean(process.env.SERPAPI_KEY), tracing: sentryEnabled() },
  });
}
