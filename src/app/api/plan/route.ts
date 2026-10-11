import { mastra } from "@/mastra";
import { getModelConfig } from "@/mastra/model";
import { planRequestSchema } from "@/lib/server/gather";
import { clientIp, rateLimited } from "@/lib/server/limits";
import { traceWorkflow } from "@/lib/server/telemetry";
import type { Planned } from "@/mastra/workflows/planWalk";

export const runtime = "nodejs";
export const maxDuration = 120;

// Plan a walk with Gemma on the server (laptop or cloud tier).
export async function POST(req: Request) {
  if (await rateLimited(clientIp(req), 10, "plan")) return Response.json({ error: "rate_limited" }, { status: 429 });
  const parsed = planRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });

  try {
    const run = await mastra.getWorkflow("planWalkWorkflow").createRun();
    const out = await traceWorkflow("plan-walk", () => run.start({ inputData: parsed.data }));
    if (out.status !== "success") {
      console.error("[plan]", out);
      return Response.json({ error: "plan_failed" }, { status: 502 });
    }
    const { result, unsupported, gemmaMs } = out.result as Planned;
    if (unsupported) return Response.json({ error: "unsupported_country", ...unsupported }, { status: 422 });
    const { tier, modelId } = getModelConfig();
    return Response.json({ ...result, tier, model: modelId, gemmaMs });
  } catch (e) {
    console.error("[plan]", e);
    return Response.json({ error: "plan_failed", message: String(e) }, { status: 502 });
  }
}
