import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DEFAULT_COUNTRY } from "../countries";
import { haversine } from "../plan/geo";
import { fetchArea } from "../plan/overpass";
import { fetchWeather } from "../plan/weather";
import { areaCenter, radiusFor } from "../plan/select";
import type { AreaData, LatLng, Weather } from "../plan/types";
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

export async function loadArea(start: LatLng, minutes: number): Promise<AreaData> {
  const radius = radiusFor(minutes);
  const center = areaCenter(start);
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
    const a = res.ok ? ((await res.json()) as { address?: Record<string, string> }).address : undefined;
    // Nominatim turns busy shared servers away (429): fall back, but don't remember the fallback.
    if (!a?.country_code) return { country: DEFAULT_COUNTRY, town: null };
    const place = { country: a.country_code.toLowerCase(), town: a.city ?? a.town ?? a.village ?? a.municipality ?? null };
    await kvSet(key, place, 30 * 24 * 60 * 60);
    return place;
  } catch {
    return { country: DEFAULT_COUNTRY, town: null };
  }
}

/** Weather for a ~5 km cell, shared for two hours: one Open-Meteo call serves a whole town. */
export async function weatherAt(p: LatLng): Promise<Weather | null> {
  const key = `weather:${(Math.round(p.lat * 20) / 20).toFixed(2)},${(Math.round(p.lon * 20) / 20).toFixed(2)}`;
  const hit = await kvGet<Weather>(key);
  if (hit) return hit;
  const w = await fetchWeather(p);
  if (w) await kvSet(key, w, 2 * 60 * 60);
  return w;
}
