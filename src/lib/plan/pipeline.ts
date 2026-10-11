import type { Scheme } from "../countries";
import type { GuardedPlan } from "../ai/guard";
import type { PlannerInput } from "../ai/prompts";
import { estimate, type Estimate } from "./estimate";
import { googleMapsUrl } from "./export";
import { haversine } from "./geo";
import type { RouteGeometry } from "./route";
import { KIND_LABEL, buildHotspots } from "./score";
import { askedForReturnPoint, budgetM, candidateReturnPoints, chooseRoute, reachable, stopsFor } from "./select";
import type { AreaData, Context, Hotspot, LatLng, LocalEvent, ReturnPoint, Weather } from "./types";

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
  events: LocalEvent[];
  areaFrom: AreaData["from"];
  hotspots: (Hotspot & { distM: number })[];
  returnPoints: (ReturnPoint & { distM: number })[];
  fallback: { stopIds: string[]; returnPointId: string };
  /** For each return point on offer, the best stops that still fit the time if the walk ends there. */
  routes: Record<string, string[]>;
  plannerInput: PlannerInput;
  defaultTitle: string;
  startNear: string | null;
};

export function prepare(area: AreaData, req: PlanRequest, scheme: Scheme, weather: Weather | null, events: LocalEvent[] = []): Prepared {
  const ctx: Context = { weather, weekday: req.weekday, history: req.history, events };
  const all = buildHotspots(area, ctx);
  const near = reachable(req.start, req.minutes, all).slice(0, 12);
  const rps = candidateReturnPoints(req.start, area.returnPoints);
  // If they named a shop, it is on offer even when it isn't one of the nearest.
  const asked = req.intent ? askedForReturnPoint(req.intent, req.start, area.returnPoints) : null;
  if (asked && !rps.some((r) => r.id === asked.id)) rps.push(asked);

  // Where the walk ends decides which stops fit, so work that out per return
  // point here rather than leave the arithmetic to Gemma.
  const routes: Record<string, string[]> = {};
  for (const rp of rps) routes[rp.id] = chooseRoute(req.start, req.minutes, all, [rp])?.stopIds ?? [];
  const fallback = asked
    ? { stopIds: routes[asked.id], returnPointId: asked.id }
    : (chooseRoute(req.start, req.minutes, all, area.returnPoints) ?? { stopIds: [], returnPointId: rps[0]?.id ?? "" });

  const dist = (p: LatLng) => Math.round(haversine(req.start, p) / 10) * 10;
  const offered = near.map((h) => ({ ...h, distM: dist(h) }));
  // Every stop in a precomputed route must be on offer to Gemma, even if it ranked lower.
  for (const id of new Set([...fallback.stopIds, ...Object.values(routes).flat()])) {
    if (!offered.some((h) => h.id === id)) {
      const h = all.find((x) => x.id === id);
      if (h) offered.push({ ...h, distM: dist(h) });
    }
  }
  const hotspots = distinctLabels(offered, req.start);
  const returnPoints = rps.map((r) => ({ ...r, distM: dist(r) }));

  const first = offered.find((h) => h.id === fallback.stopIds[0]);
  const defaultTitle = first ? `${shortName(first.label)} loop` : `${req.minutes}-minute walk`;
  const startNear = nearestPlace(area, req.start);

  return {
    request: req,
    scheme,
    weather,
    events,
    areaFrom: area.from,
    hotspots,
    returnPoints,
    fallback,
    routes,
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
      routes,
      budgetKm: Math.round(budgetM(req.minutes, stopsFor(req.minutes)) / 100) / 10,
      scheme,
      donate: req.donate,
    },
  };
}

const GENERIC = new Set(Object.values(KIND_LABEL).flat());

/**
 * Two stops called "Pitch, Wildflower Meadow" read like a bug, and the spoken
 * briefing would send you to the same place twice. Name them by which end of
 * the place they are at, or, with no place name or too many of them, by how
 * far and which way they are from where you stand.
 */
export function distinctLabels<T extends Hotspot>(hotspots: T[], from?: LatLng): T[] {
  const groups = new Map<string, T[]>();
  for (const h of hotspots) groups.set(h.label, [...(groups.get(h.label) ?? []), h]);
  const renamed = new Map<string, string>();
  for (const [label, group] of groups) {
    if (group.length < 2) continue;
    const [kind, ...rest] = label.split(", ");
    const place = rest.join(", ");
    if (place && group.length <= 3) {
      const lats = group.map((h) => h.lat);
      const lons = group.map((h) => h.lon * Math.cos((h.lat * Math.PI) / 180));
      const northSouth = Math.max(...lats) - Math.min(...lats) >= Math.max(...lons) - Math.min(...lons);
      const sorted = [...group].sort((a, b) => (northSouth ? b.lat - a.lat : a.lon - b.lon));
      const ends = northSouth ? ["north", "middle", "south"] : ["west", "middle", "east"];
      sorted.forEach((h, i) => renamed.set(h.id, `${kind}, ${(sorted.length === 2 ? [ends[0], ends[2]] : ends)[i]} end of ${place}`));
    } else if (from) {
      for (const h of group) renamed.set(h.id, `${label}, ${bearing(from, h)}`);
    }
    // Still the same (same distance, same way): number them.
    const names = group.map((h) => renamed.get(h.id) ?? label);
    group.forEach((h, i) => {
      if (names.filter((n) => n === names[i]).length > 1) renamed.set(h.id, `${names[i]} (${names.slice(0, i + 1).filter((n) => n === names[i]).length})`);
    });
  }
  return hotspots.map((h) => (renamed.has(h.id) ? { ...h, label: renamed.get(h.id)! } : h));
}

/** Short names for the briefing; two that would sound the same keep what they are: "the pitches in Monbijoupark". */
export function spokenNames(labels: string[]): string[] {
  const short = labels.map(shortName);
  return short.map((name, i) => {
    if (short.filter((n) => n === name).length < 2) return name;
    const [kind, ...rest] = labels[i].split(", ");
    return rest.length ? `the ${kind.toLowerCase()} in ${rest.join(", ")}` : name;
  });
}

/** "400 m north" from where the walker stands. */
export function bearing(from: LatLng, to: LatLng): string {
  const dy = to.lat - from.lat;
  const dx = (to.lon - from.lon) * Math.cos((from.lat * Math.PI) / 180);
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const way = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((deg + 360) % 360) / 45) % 8];
  return `${Math.round(haversine(from, to) / 50) * 50} m ${way}`;
}

/** "Picnic tables, College Park" → "College Park"; "Kennedy Park Playground, Eyre Square" → "Kennedy Park Playground". */
export const shortName = (label: string) => {
  const [first, ...rest] = label.split(", ");
  // "Pitch, 400 m north" is said as "the pitch 400 m north".
  if (/^\d+ m [a-z-]+( \(\d+\))?$/.test(rest.join(", "))) return `the ${first.toLowerCase()} ${rest.join(", ")}`;
  const name = GENERIC.has(first) && rest.length ? rest.join(", ") : first;
  // "west end of Wildflower Meadow" is read aloud: "head to the west end of…".
  return /^(north|south|east|west|middle) end of /.test(name) ? `the ${name}` : name;
};

export const DEFAULT_LOOK_FOR = "Check under benches, along hedges and by the pitch edges as you go.";
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
      stops: spokenNames(stops.map((h) => h.label)),
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
