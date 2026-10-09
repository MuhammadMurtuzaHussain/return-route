import { DETOUR, DWELL_MIN, WALK_M_PER_MIN, haversine, pathLength } from "./geo";
import type { Hotspot, LatLng, ReturnPoint } from "./types";

// Pick which hotspots to visit and where to cash in. Deterministic, so it is
// both the fallback when Gemma is unavailable and the yardstick Gemma's own
// choice is checked against.

/** Google Maps on a phone takes three waypoints between origin and destination. */
export const MAX_STOPS = 3;

export type Choice = { stopIds: string[]; returnPointId: string };

export function stopsFor(minutes: number): number {
  return minutes <= 35 ? 2 : MAX_STOPS;
}

/** Walking budget in metres of real path for this many minutes and stops. */
export function budgetM(minutes: number, stops: number): number {
  return WALK_M_PER_MIN * Math.max(10, minutes - DWELL_MIN * stops);
}

/** Estimated real walking distance of a candidate route. */
export function walkM(start: LatLng, stops: LatLng[], end: LatLng): number {
  return pathLength([start, ...stops, end]) * DETOUR;
}

/** True when the route fits the time the person has (with some slack for Gemma). */
export function fits(minutes: number, start: LatLng, stops: LatLng[], end: LatLng, slack = 1.15): boolean {
  return walkM(start, stops, end) <= budgetM(minutes, stops.length) * slack;
}

/** Return points worth considering: machines first, then the nearest shops. */
export function candidateReturnPoints(start: LatLng, points: ReturnPoint[], max = 6): ReturnPoint[] {
  const byDist = [...points].sort((a, b) => haversine(start, a) - haversine(start, b));
  const machines = byDist.filter((p) => p.confidence === "machine").slice(0, 3);
  const shops = byDist.filter((p) => p.confidence === "shop").slice(0, max - machines.length);
  return [...machines, ...shops];
}

/** Hotspots you could walk to and back from in the time, best first. */
export function reachable(start: LatLng, minutes: number, hotspots: Hotspot[]): Hotspot[] {
  const reach = budgetM(minutes, 1) / 2;
  return hotspots.filter((h) => haversine(start, h) * DETOUR <= reach);
}

function* permutations<T>(items: T[], k: number, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === k) {
    yield prefix;
    return;
  }
  for (const it of items) if (!prefix.includes(it)) yield* permutations(items, k, [...prefix, it]);
}

export function chooseRoute(
  start: LatLng,
  minutes: number,
  hotspots: Hotspot[],
  returnPoints: ReturnPoint[],
  topN = 12,
): Choice | null {
  const pool = reachable(start, minutes, hotspots).slice(0, topN);
  const rps = candidateReturnPoints(start, returnPoints);
  if (!rps.length) return null;

  for (let k = Math.min(stopsFor(minutes), pool.length); k >= 1; k--) {
    const budget = budgetM(minutes, k);
    let best: { value: number; len: number; choice: Choice } | null = null;
    for (const perm of permutations(pool, k)) {
      const expected = perm.reduce((s, h) => s + h.expected, 0);
      for (const rp of rps) {
        const len = walkM(start, perm, rp);
        if (len > budget * 1.1) continue;
        // Prefer a real machine, and a route that uses the time rather than a stroll to the shop.
        const value = expected * (rp.confidence === "machine" ? 1.1 : 1) * (0.7 + 0.3 * Math.min(1, len / budget));
        if (!best || value > best.value || (value === best.value && len < best.len)) {
          best = { value, len, choice: { stopIds: perm.map((h) => h.id), returnPointId: rp.id } };
        }
      }
    }
    if (best) return best.choice;
  }
  // Nothing fits: just go and cash in at the nearest return point.
  return { stopIds: [], returnPointId: rps[0].id };
}
