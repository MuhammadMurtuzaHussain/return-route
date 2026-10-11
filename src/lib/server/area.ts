import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DEFAULT_COUNTRY } from "../countries";
import { DETOUR, haversine } from "../plan/geo";
import { fetchArea } from "../plan/overpass";
import { budgetM } from "../plan/select";
import type { AreaData, LatLng } from "../plan/types";
import { kvGet, kvSet } from "./kv";

// Map data with two safety nets: a shared cache (one Overpass call per
// neighbourhood every 12 hours, in Render Key Value when it is configured) and
// saved snapshots for the demo cities.

const AREA_TTL_SEC = 12 * 60 * 60;

let snapshots: AreaData[] | null = null;
function loadSnapshots(): AreaData[] {
  if (snapshots) return snapshots;
  const dir = path.join(process.cwd(), "data");
  try {
    snapshots = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as AreaData);
  } catch {
    snapshots = [];
  }
  return snapshots;
}

/** Radius that covers any walk of this length from here, rounded so nearby requests share a cache entry. */
export function radiusFor(minutes: number): number {
  const reach = budgetM(minutes, 1) / 2 / DETOUR;
  return Math.min(4000, Math.ceil((reach + 900) / 500) * 500);
}

export async function loadArea(start: LatLng, minutes: number): Promise<AreaData> {
  const radius = radiusFor(minutes);
  // Snap the centre to a ~1 km grid so a walker moving down the street hits the cache.
  const center = { lat: Math.round(start.lat * 100) / 100, lon: Math.round(start.lon * 100) / 100 };
  const key = `area:${center.lat},${center.lon},${radius}`;
  const hit = await kvGet<AreaData>(key);
  if (hit) return hit;

  // Snapshots first when we are inside one: instant, and kind to the public Overpass servers.
  const snap = loadSnapshots().find((s) => haversine(s.center, start) + radius * 0.6 <= s.radiusM);
  if (snap && process.env.PREFER_LIVE_OSM !== "1") return snap;

  try {
    const area = await fetchArea(center, radius + 600);
    await kvSet(key, area, AREA_TTL_SEC);
    return area;
  } catch (e) {
    const near = loadSnapshots().find((s) => haversine(s.center, start) <= s.radiusM);
    if (near) return near;
    throw e;
  }
}

export type Place = { country: string; town: string | null };

/** Country code and town for a point, via OpenStreetMap's Nominatim. Cached for a month. */
export async function detectPlace(p: LatLng): Promise<Place> {
  const key = `place:${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
  const hit = await kvGet<Place>(key);
  if (hit) return hit;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${p.lat.toFixed(3)}&lon=${p.lon.toFixed(3)}`,
      { headers: { "User-Agent": "ReturnRoute/0.1 (+https://github.com/MuhammadMurtuzaHussain/return-route)" }, signal: AbortSignal.timeout(6000) },
    );
    const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
    const place = { country: a.country_code?.toLowerCase() ?? DEFAULT_COUNTRY, town: a.city ?? a.town ?? a.village ?? a.municipality ?? null };
    await kvSet(key, place, 30 * 24 * 60 * 60);
    return place;
  } catch {
    return { country: DEFAULT_COUNTRY, town: null };
  }
}
