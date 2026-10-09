import { z } from "zod";
import { getScheme, NOT_YET } from "../countries";
import { prepare, type PlanRequest, type Prepared } from "../plan/pipeline";
import { fetchWeather } from "../plan/weather";
import { detectCountry, loadArea } from "./area";

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

/** Map data, weather and the deposit scheme for where the walker is standing. No AI here. */
export async function gather(req: PlanRequestInput): Promise<Gathered> {
  const code = req.country ?? (await detectCountry(req.start));
  const scheme = getScheme(code);
  if (!scheme) {
    return {
      prepared: null,
      unsupported: { code, message: NOT_YET[code] ?? "There is no drinks deposit scheme here yet, so there is nothing to return." },
    };
  }
  const [area, weather] = await Promise.all([loadArea(req.start, req.minutes), fetchWeather(req.start)]);
  return { prepared: prepare(area, req as PlanRequest, scheme, weather), unsupported: null };
}
