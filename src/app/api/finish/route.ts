import { guardPlan } from "@/lib/ai/guard";
import { planPickSchema } from "@/lib/ai/schema";
import { finish, waypoints, type Prepared } from "@/lib/plan/pipeline";
import { routeWalk } from "@/lib/plan/route";
import { reportGuard } from "@/lib/server/telemetry";
import { EDGE_MODEL_LABEL } from "@/lib/ai/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

// Phone tier, step 2: the browser's Gemma has picked; guard it, route it, price it.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { prepared?: Prepared; pick?: unknown } | null;
  const p = body?.prepared;
  if (!p?.request?.start || !Array.isArray(p.hotspots) || !Array.isArray(p.returnPoints)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const pick = planPickSchema.safeParse(body?.pick);
  const guarded = guardPlan(pick.success ? pick.data : null, {
    start: p.request.start,
    minutes: p.request.minutes,
    hotspots: p.hotspots,
    returnPoints: p.returnPoints,
    fallback: p.fallback,
    defaultTitle: p.defaultTitle,
  });
  // The phone's Gemma never talks to the server, but its picks are guarded here, so its slips are counted too.
  reportGuard("plan", guarded.flags, { tier: "edge", model: EDGE_MODEL_LABEL });
  const route = await routeWalk(waypoints(p, guarded));
  return Response.json(finish(p, guarded, route));
}
