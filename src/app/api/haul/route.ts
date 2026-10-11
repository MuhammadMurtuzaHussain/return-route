import { getModelConfig } from "@/mastra/model";
import { readHaulWithGemma } from "@/mastra/gemma";
import { haulTotals } from "@/lib/ai/guard";
import { getScheme, DEFAULT_COUNTRY } from "@/lib/countries";
import { clientIp, rateLimited } from "@/lib/server/limits";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024;

// Read a haul photo with Gemma on the server (laptop or cloud tier).
// The phone tier never calls this: the photo stays on the phone.
export async function POST(req: Request) {
  if (await rateLimited(clientIp(req), 6, "haul")) return Response.json({ error: "rate_limited" }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || !file.type.startsWith("image/")) return Response.json({ error: "bad_request" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const scheme = getScheme(String(form?.get("country") ?? DEFAULT_COUNTRY)) ?? getScheme(DEFAULT_COUNTRY)!;

  const t0 = Date.now();
  try {
    const reading = await readHaulWithGemma(new Uint8Array(await file.arrayBuffer()), file.type, scheme);
    const { tier, modelId } = getModelConfig();
    return Response.json({ reading, totals: haulTotals(reading.items, scheme), tier, model: modelId, gemmaMs: Date.now() - t0 });
  } catch (e) {
    console.error("[haul]", e);
    return Response.json({ error: "haul_failed" }, { status: 502 });
  }
}
