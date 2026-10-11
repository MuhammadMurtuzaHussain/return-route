import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { guardPlan, type GuardedPlan } from "@/lib/ai/guard";
import { getScheme, NOT_YET, type Scheme } from "@/lib/countries";
import { finish, prepare, type PlanRequest, type PlanResult, type Prepared } from "@/lib/plan/pipeline";
import { routeWithinTime } from "@/lib/plan/route";
import type { AreaData, Weather } from "@/lib/plan/types";
import { detectPlace, loadArea, weatherAt } from "@/lib/server/area";
import { eventsToday, locateEvents } from "@/lib/server/events";
import { planRequestSchema, type Gathered, type PlanRequestInput } from "@/lib/server/gather";
import { reportGuard, traceStep } from "@/lib/server/telemetry";
import { pickWithGemma } from "../gemma";
import { getModelConfig } from "../model";

// Planning a walk as a Mastra workflow:
//   place → map ‖ weather ‖ events → assemble → pick (Gemma) + guard → route (Valhalla) + estimate
// Only "pick" is AI. Everything around it is deterministic and tested, which is
// what lets a 2B model on a phone do the same job as a 26B model in the cloud.
// The phone tier runs the first half (prepareWalkWorkflow) on the server and
// does "pick" with Gemma in the browser.

// Steps hand plain objects along; their shapes are built and checked in src/lib.
const passThrough = z.any();

type Placed = { req: PlanRequestInput; scheme: Scheme; town: string | null };
type Unsupported = { prepared: null; unsupported: { code: string; message: string } };

const placeStep = createStep({
  id: "place",
  description: "Which country's deposit scheme applies, and which town to look up events for",
  inputSchema: planRequestSchema,
  outputSchema: passThrough,
  execute: async ({ inputData, bail }) =>
    traceStep("place", async () => {
      const needTown = Boolean(process.env.SERPAPI_KEY);
      const place = inputData.country && !needTown ? { country: inputData.country, town: null } : await detectPlace(inputData.start);
      const code = inputData.country ?? place.country;
      const scheme = getScheme(code);
      if (!scheme) {
        return bail<Unsupported>({
          prepared: null,
          unsupported: { code, message: NOT_YET[code] ?? "There is no drinks deposit scheme here yet, so there is nothing to return." },
        });
      }
      return { req: inputData, scheme, town: place.town } satisfies Placed;
    }),
});

const mapStep = createStep({
  id: "map",
  description: "Picnic tables, pitches, off-licences and return machines from OpenStreetMap (cached in Render Key Value)",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData }) => {
    const { req } = inputData as Placed;
    return traceStep("map", async () => (req.area ? { ...req.area, from: "overpass" as const } : loadArea(req.start, req.minutes)));
  },
});

const weatherStep = createStep({
  id: "weather",
  description: "Yesterday's weather from Open-Meteo (cached in Render Key Value)",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData }) => {
    const { req } = inputData as Placed;
    return traceStep("weather", async () => req.weather ?? weatherAt(req.start));
  },
});

const eventsStep = createStep({
  id: "events",
  description: "What's on in town today, from Google Events through SerpApi",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData }) => traceStep("events", () => eventsToday((inputData as Placed).town, (inputData as Placed).scheme.code)),
});

const assembleStep = createStep({
  id: "assemble",
  description: "Score hotspots and shortlist stops and return points for Gemma",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData, getStepResult }): Promise<Gathered> =>
    traceStep("assemble", async () => {
      const { req, scheme, town } = getStepResult<Placed>("place");
      const { map, weather, events } = inputData as { map: AreaData; weather: Weather | null; events: Awaited<ReturnType<typeof eventsToday>> };
      const located = await locateEvents(events, town, map);
      // The map and weather the browser may have sent are inputs, not part of the request to echo back.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { area, weather: sent, ...request } = req;
      return { prepared: prepare(map, request as PlanRequest, scheme, weather, located), unsupported: null };
    }),
});

export type Picked = Gathered & { guarded: GuardedPlan | null; gemmaMs: number };

const pickStep = createStep({
  id: "pick",
  description: "Gemma picks and orders the stops; the guard keeps only real places that fit the time",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData }): Promise<Picked> =>
    traceStep("pick", async () => {
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
        routes: p.routes,
        defaultTitle: p.defaultTitle,
      });
      if (failed) guarded.flags.push("model_error");
      const { tier, modelId } = getModelConfig();
      reportGuard("plan", guarded.flags, { tier, model: modelId });
      return { ...g, guarded, gemmaMs: Date.now() - t0 };
    }),
});

export type Planned = { result: PlanResult | null; unsupported: Gathered["unsupported"]; gemmaMs: number };

const routeStep = createStep({
  id: "route",
  description: "Walking route from Valhalla, checked against the time (a stop is dropped if the real path is too long), and an estimate priced from the deposit table",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData }): Promise<Planned> =>
    traceStep("route", async () => {
      const { prepared, unsupported, guarded, gemmaMs } = inputData as Picked;
      if (!prepared || !guarded) return { result: null, unsupported, gemmaMs };
      const fitted = await routeWithinTime(prepared, guarded);
      const { tier, modelId } = getModelConfig();
      reportGuard("plan", fitted.dropped, { tier, model: modelId });
      return { result: finish(prepared, fitted.guarded, fitted.route), unsupported: null, gemmaMs };
    }),
});

/** Phone tier: everything up to Gemma. The browser picks, then /api/finish guards and routes. */
export const prepareWalkWorkflow = createWorkflow({
  id: "prepare-walk",
  inputSchema: planRequestSchema,
  outputSchema: passThrough,
})
  .then(placeStep)
  .parallel([mapStep, weatherStep, eventsStep])
  .then(assembleStep)
  .commit();

/** Laptop and cloud tiers: the whole plan, Gemma included. */
export const planWalkWorkflow = createWorkflow({
  id: "plan-walk",
  inputSchema: planRequestSchema,
  outputSchema: passThrough,
})
  .then(placeStep)
  .parallel([mapStep, weatherStep, eventsStep])
  .then(assembleStep)
  .then(pickStep)
  .then(routeStep)
  .commit();
