import type { Scheme } from "../countries";
import type { GuardedPlan } from "../ai/guard";
import type { PlannerInput } from "../ai/prompts";
import { estimate, type Estimate } from "./estimate";
import { googleMapsUrl } from "./export";
import { haversine } from "./geo";
import type { RouteGeometry } from "./route";
import { KIND_LABEL, buildHotspots } from "./score";
import { candidateReturnPoints, chooseRoute, reachable, stopsFor } from "./select";
import type { AreaData, Context, Hotspot, LatLng, ReturnPoint, Weather } from "./types";

// The two deterministic halves of planning a walk, either side of Gemma.
// Pure functions, so the server (cloud and laptop tiers) and the browser
// (phone tier) run exactly the same code and only swap where Gemma runs.

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type PlanRequest = {
  start: LatLng;
  minutes: number;
  intent: string;
  donate: boolean;
  weekday: number;
  history?: Record<string, number>;
};

export type Prepared = {
  request: PlanRequest;
  scheme: Scheme;
  weather: Weather | null;
  areaFrom: AreaData["from"];
  hotspots: (Hotspot & { distM: number })[];
  returnPoints: (ReturnPoint & { distM: number })[];
  fallback: { stopIds: string[]; returnPointId: string };
  plannerInput: PlannerInput;
  defaultTitle: string;
  startNear: string | null;
};

export function prepare(area: AreaData, req: PlanRequest, scheme: Scheme, weather: Weather | null): Prepared {
  const ctx: Context = { weather, weekday: req.weekday, history: req.history };
  const all = buildHotspots(area, ctx);
  const near = reachable(req.start, req.minutes, all).slice(0, 12);
  const rps = candidateReturnPoints(req.start, area.returnPoints);
  const fallback = chooseRoute(req.start, req.minutes, all, area.returnPoints) ?? { stopIds: [], returnPointId: rps[0]?.id ?? "" };

  const dist = (p: LatLng) => Math.round(haversine(req.start, p) / 10) * 10;
  const hotspots = near.map((h) => ({ ...h, distM: dist(h) }));
  // The fallback's stops must be on offer to Gemma even if they ranked lower.
  for (const id of fallback.stopIds) {
    if (!hotspots.some((h) => h.id === id)) {
      const h = all.find((x) => x.id === id);
      if (h) hotspots.push({ ...h, distM: dist(h) });
    }
  }
  const returnPoints = rps.map((r) => ({ ...r, distM: dist(r) }));

  const first = hotspots.find((h) => h.id === fallback.stopIds[0]);
  const defaultTitle = first ? `${shortName(first.label)} loop` : `${req.minutes}-minute walk`;
  const startNear = nearestPlace(area, req.start);

  return {
    request: req,
    scheme,
    weather,
    areaFrom: area.from,
    hotspots,
    returnPoints,
    fallback,
    defaultTitle,
    startNear,
    plannerInput: {
      minutes: req.minutes,
      intent: req.intent,
      startNear,
      stopsWanted: Math.max(1, Math.min(stopsFor(req.minutes), fallback.stopIds.length || 1)),
      weekdayName: WEEKDAYS[req.weekday],
      weather,
      hotspots,
      returnPoints,
      suggestion: fallback,
      scheme,
      donate: req.donate,
    },
  };
}

const GENERIC = new Set(Object.values(KIND_LABEL).flat());

/** "Picnic tables, College Park" → "College Park"; "Kennedy Park Playground, Eyre Square" → "Kennedy Park Playground". */
export const shortName = (label: string) => {
  const [first, ...rest] = label.split(", ");
  return GENERIC.has(first) && rest.length ? rest.join(", ") : first;
};

export const DEFAULT_LOOK_FOR = "Check under benches, along hedges and around the bins as you go.";
export const DEFAULT_TIP = "Ground litter only, gloves on, and leave anything broken.";

/**
 * What the phone says out loud before you put it away. The places come from
 * the map, not the model, so a small model can't send you to the wrong park.
 */
export function composeBriefing(p: { startNear: string | null; stops: string[]; returnPoint: string; donate: boolean; lookFor: string; tip: string }): string {
  const from = p.startNear ? `From ${p.startNear}, ` : "";
  const route = p.stops.length
    ? `${from}head to ${p.stops[0]} first${p.stops.length > 1 ? `, then ${p.stops.slice(1).join(" and ")}` : ""}.`
    : `${from}walk to ${p.returnPoint}, picking up as you go.`;
  const end = p.donate ? `Finish at ${p.returnPoint} and donate the refund.` : `Finish at ${p.returnPoint} to cash in.`;
  const sentence = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s);
  return [route, sentence(p.lookFor || DEFAULT_LOOK_FOR), end, sentence(p.tip || DEFAULT_TIP)].join(" ");
}

/** A name for where the walker is standing: the nearest named park within 600 m. */
export function nearestPlace(area: AreaData, at: LatLng): string | null {
  let best: { d: number; name: string } | null = null;
  for (const p of area.parks) {
    const d = haversine(at, p);
    if (d <= 600 && (!best || d < best.d)) best = { d, name: p.name };
  }
  return best?.name ?? null;
}

export type PlanStop = { id: string; label: string; lat: number; lon: number; why: string; expected: number; reasons: string[] };

export type PlanResult = {
  title: string;
  briefing: string;
  start: LatLng;
  stops: PlanStop[];
  returnPoint: ReturnPoint;
  route: RouteGeometry;
  estimate: Estimate;
  googleMapsUrl: string;
  weather: Weather | null;
  country: string;
  donate: boolean;
  areaFrom: AreaData["from"];
  flags: string[];
};

/** Points to route through, in order: start, stops, return point. */
export function waypoints(p: Prepared, g: GuardedPlan): LatLng[] {
  const stops = g.stopIds.map((id) => p.hotspots.find((h) => h.id === id)).filter((h): h is Prepared["hotspots"][number] => !!h);
  const rp = p.returnPoints.find((r) => r.id === g.returnPointId) ?? p.returnPoints[0];
  return [p.request.start, ...stops.map(({ lat, lon }) => ({ lat, lon })), { lat: rp.lat, lon: rp.lon }];
}

export function finish(p: Prepared, g: GuardedPlan, route: RouteGeometry): PlanResult {
  const stops = g.stopIds
    .map((id) => p.hotspots.find((h) => h.id === id))
    .filter((h): h is Prepared["hotspots"][number] => !!h);
  const rp = p.returnPoints.find((r) => r.id === g.returnPointId) ?? p.returnPoints[0];
  return {
    title: g.title,
    briefing: composeBriefing({
      startNear: p.startNear,
      stops: stops.map((h) => shortName(h.label)),
      returnPoint: rp.name,
      donate: p.request.donate,
      lookFor: g.lookFor,
      tip: g.tip,
    }),
    start: p.request.start,
    stops: stops.map((h) => ({
      id: h.id,
      label: h.label,
      lat: h.lat,
      lon: h.lon,
      why: g.why[h.id] || h.reasons.slice(0, 2).join(", "),
      expected: h.expected,
      reasons: h.reasons,
    })),
    returnPoint: { id: rp.id, name: rp.name, lat: rp.lat, lon: rp.lon, confidence: rp.confidence },
    route,
    estimate: estimate(stops, route.km, p.scheme),
    googleMapsUrl: googleMapsUrl(p.request.start, stops, rp),
    weather: p.weather,
    country: p.scheme.code,
    donate: p.request.donate,
    areaFrom: p.areaFrom,
    flags: g.flags,
  };
}
