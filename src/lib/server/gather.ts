import { z } from "zod";
import type { Prepared } from "../plan/pipeline";

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
});
export type PlanRequestInput = z.infer<typeof planRequestSchema>;

export type Gathered = { prepared: Prepared; unsupported: null } | { prepared: null; unsupported: { code: string; message: string } };
