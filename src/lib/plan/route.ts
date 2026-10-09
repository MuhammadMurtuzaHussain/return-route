import { DETOUR, WALK_M_PER_MIN, decodePolyline, pathLength } from "./geo";
import type { LatLng } from "./types";

// Walking directions from Valhalla, the open-source routing engine, on the
// FOSSGIS public server. If it is down we still draw straight lines between
// stops: Google Maps does the turn-by-turn on the walk anyway.

export type RouteGeometry = {
  line: LatLng[];
  km: number;
  minutes: number;
  from: "valhalla" | "straight";
};

const VALHALLA = process.env.VALHALLA_URL ?? "https://valhalla1.openstreetmap.de/route";

export async function routeWalk(points: LatLng[]): Promise<RouteGeometry> {
  try {
    const res = await fetch(VALHALLA, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "ReturnRoute/0.1" },
      body: JSON.stringify({
        locations: points.map((p) => ({ lat: p.lat, lon: p.lon })),
        costing: "pedestrian",
        // Parks and paths over main roads.
        costing_options: { pedestrian: { walkway_factor: 0.8, sidewalk_factor: 1, alley_factor: 2 } },
        units: "kilometers",
        directions_type: "none",
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`valhalla ${res.status}`);
    const j = (await res.json()) as { trip: { legs: { shape: string }[]; summary: { length: number; time: number } } };
    const line = j.trip.legs.flatMap((l) => decodePolyline(l.shape, 6));
    return { line, km: round2(j.trip.summary.length), minutes: Math.round(j.trip.summary.time / 60), from: "valhalla" };
  } catch {
    const m = pathLength(points) * DETOUR;
    return { line: points, km: round2(m / 1000), minutes: Math.round(m / WALK_M_PER_MIN), from: "straight" };
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
