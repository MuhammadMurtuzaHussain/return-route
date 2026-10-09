import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { guardPlan, type GuardedPlan } from "@/lib/ai/guard";
import { finish, waypoints, type PlanResult, type Prepared } from "@/lib/plan/pipeline";
import { routeWalk } from "@/lib/plan/route";
import { gather, planRequestSchema, type Gathered } from "@/lib/server/gather";
import { pickWithGemma } from "../gemma";

// Planning a walk as a Mastra workflow:
//   gather (OpenStreetMap + Open-Meteo + deposit scheme)  →  pick (Gemma) + guard  →  route (Valhalla) + estimate
// Only "pick" is AI. Everything around it is deterministic and tested, which is
// what lets a 2B model on a phone do the same job as a 26B model in the cloud.

// Steps hand plain objects along; their shapes are built and checked in src/lib.
const passThrough = z.any();

const gatherStep = createStep({
  id: "gather",
  inputSchema: planRequestSchema,
  outputSchema: passThrough,
  execute: async ({ inputData }) => gather(inputData),
});

export type Picked = Gathered & { guarded: GuardedPlan | null; gemmaMs: number };

const pickStep = createStep({
  id: "pick",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData }): Promise<Picked> => {
    const g = inputData as Gathered;
    if (!g.prepared) return { ...g, guarded: null, gemmaMs: 0 };
    const p: Prepared = g.prepared;
    const t0 = Date.now();
    let pick = null;
    let failed = false;
    if (p.hotspots.length) {
      try {
        pick = await pickWithGemma(p.plannerInput);
      } catch (e) {
        console.error("[plan] gemma", e);
        failed = true;
      }
    }
    const guarded = guardPlan(pick, {
      start: p.request.start,
      minutes: p.request.minutes,
      hotspots: p.hotspots,
      returnPoints: p.returnPoints,
      fallback: p.fallback,
      defaultTitle: p.defaultTitle,
    });
    if (failed) guarded.flags.push("model_error");
    return { ...g, guarded, gemmaMs: Date.now() - t0 };
  },
});

export type Planned = { result: PlanResult | null; unsupported: Gathered["unsupported"]; gemmaMs: number };

const routeStep = createStep({
  id: "route",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData }): Promise<Planned> => {
    const { prepared, unsupported, guarded, gemmaMs } = inputData as Picked;
    if (!prepared || !guarded) return { result: null, unsupported, gemmaMs };
    const route = await routeWalk(waypoints(prepared, guarded));
    return { result: finish(prepared, guarded, route), unsupported: null, gemmaMs };
  },
});

export const planWalkWorkflow = createWorkflow({
  id: "plan-walk",
  inputSchema: planRequestSchema,
  outputSchema: passThrough,
})
  .then(gatherStep)
  .then(pickStep)
  .then(routeStep)
  .commit();
