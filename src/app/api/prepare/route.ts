import { gather, planRequestSchema } from "@/lib/server/gather";
import { clientIp, rateLimited } from "@/lib/server/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

// Phone tier, step 1: map data, weather and the deposit scheme. No AI on the
// server: the browser runs Gemma itself on what this returns.
export async function POST(req: Request) {
  if (rateLimited(clientIp(req), 20)) return Response.json({ error: "rate_limited" }, { status: 429 });
  const parsed = planRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    const g = await gather(parsed.data);
    if (g.unsupported) return Response.json({ error: "unsupported_country", ...g.unsupported }, { status: 422 });
    return Response.json(g.prepared);
  } catch (e) {
    console.error("[prepare]", e);
    return Response.json({ error: "map_unavailable", message: String(e) }, { status: 502 });
  }
}
