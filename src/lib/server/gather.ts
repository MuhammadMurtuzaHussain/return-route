import { z } from "zod";
import type { Prepared } from "../plan/pipeline";
import type { AreaData } from "../plan/types";

// The request a walk is planned from, checked at the edge of every API route.
// Gathering the map data, weather and events for it is a Mastra workflow:
// src/mastra/workflows/planWalk.ts.

const latLng = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

export const planRequestSchema = z.object({
  start: latLng,
  minutes: z.number().int().min(15).max(180),
  intent: z.string().max(400).default(""),
  donate: z.boolean().default(false),
  weekday: z.number().int().min(0).max(6),
  history: z.record(z.string(), z.number().min(0.2).max(3)).optional(),
  country: z.string().length(2).optional(),
  // Fetched by the browser when this server's shared address is turned away by
  // the public map and weather servers. They only ever shape this one plan.
  weather: z
    .object({
      yesterdayMaxC: z.number().nullable(),
      yesterdayRainMm: z.number().nullable(),
      yesterdaySunHours: z.number().nullable(),
      nowC: z.number().nullable(),
      nowRainMm: z.number().nullable(),
      summary: z.string().max(200),
    })
    .optional(),
  area: z
    .custom<AreaData>((a) => {
      const x = a as AreaData;
      return !!x && typeof x === "object" && [x.features, x.sources, x.parks, x.returnPoints].every((l) => Array.isArray(l) && l.length <= 20_000);
    })
    .optional(),
});
export type PlanRequestInput = z.infer<typeof planRequestSchema>;

export type Gathered = { prepared: Prepared; unsupported: null } | { prepared: null; unsupported: { code: string; message: string } };
