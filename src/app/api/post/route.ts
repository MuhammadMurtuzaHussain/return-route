import { z } from "zod";
import { writePostWithGemma } from "@/mastra/gemma";
import { getModelConfig } from "@/mastra/model";
import { clientIp, rateLimited } from "@/lib/server/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

const factsSchema = z.object({
  place: z.string().max(80).nullable(),
  containers: z.number().int().min(0).max(500),
  donated: z.boolean(),
  cause: z.string().max(60).nullable(),
  weather: z.string().max(80).nullable(),
});

// Gemma drafts one line for the walker's post. The counts and money are added in code.
export async function POST(req: Request) {
  if (rateLimited(clientIp(req), 6)) return Response.json({ error: "rate_limited" }, { status: 429 });
  const parsed = factsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    const line = await writePostWithGemma(parsed.data);
    const { tier, modelId } = getModelConfig();
    return Response.json({ line, tier, model: modelId });
  } catch (e) {
    console.error("[post]", e);
    return Response.json({ error: "post_failed" }, { status: 502 });
  }
}
