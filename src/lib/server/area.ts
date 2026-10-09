import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DEFAULT_COUNTRY } from "../countries";
import { DETOUR, haversine } from "../plan/geo";
import { fetchArea } from "../plan/overpass";
import { budgetM } from "../plan/select";
import type { AreaData, LatLng } from "../plan/types";

// Map data with two safety nets: an in-memory cache (one Overpass call per
// neighbourhood per hour) and saved snapshots for the demo cities.

const cache = new Map<string, { at: number; area: AreaData }>();
const TTL = 60 * 60 * 1000;

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
  const key = `${center.lat},${center.lon},${radius}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.area;

  // Snapshots first when we are inside one: instant, and kind to the public Overpass servers.
  const snap = loadSnapshots().find((s) => haversine(s.center, start) + radius * 0.6 <= s.radiusM);
  if (snap && process.env.PREFER_LIVE_OSM !== "1") return snap;

  try {
    const area = await fetchArea(center, radius + 600);
    cache.set(key, { at: Date.now(), area });
    return area;
  } catch (e) {
    const near = loadSnapshots().find((s) => haversine(s.center, start) <= s.radiusM);
    if (near) return near;
    throw e;
  }
}

const countryCache = new Map<string, string>();

/** ISO country code for a point, via OpenStreetMap's Nominatim. */
export async function detectCountry(p: LatLng): Promise<string> {
  const key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  const hit = countryCache.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&lat=${p.lat.toFixed(3)}&lon=${p.lon.toFixed(3)}`,
      { headers: { "User-Agent": "ReturnRoute/0.1 (+https://github.com/MuhammadMurtuzaHussain/return-route)" }, signal: AbortSignal.timeout(6000) },
    );
    const j = (await res.json()) as { address?: { country_code?: string } };
    const code = j.address?.country_code?.toLowerCase() ?? DEFAULT_COUNTRY;
    countryCache.set(key, code);
    return code;
  } catch {
    return DEFAULT_COUNTRY;
  }
}
