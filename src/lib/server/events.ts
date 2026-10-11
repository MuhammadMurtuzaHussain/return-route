import { bbox } from "../plan/overpass";
import { haversine } from "../plan/geo";
import type { AreaData, LatLng, LocalEvent } from "../plan/types";
import { kvGet, kvSet } from "./kv";

// What's on in town today, from Google Events through SerpApi. A match, a gig
// or a festival leaves cans behind, and no map knows about it. Only the town's
// name is sent, never the walker's position. Without SERPAPI_KEY (or on a
// SerpApi plan without the Google Events engine) this returns nothing and
// planning carries on as before.

type Listed = { title: string; venue: string | null; address: string[]; when: string };
type SerpEvent = { title?: string; date?: { when?: string }; address?: string[]; venue?: { name?: string } };

const UA = { "User-Agent": "ReturnRoute/0.1 (+https://github.com/MuhammadMurtuzaHussain/return-route)" };
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** Today's events in a town, fetched once per town per day and shared through the cache. */
export async function eventsToday(town: string | null, country: string): Promise<{ today: Listed[]; yesterday: Listed[] }> {
  const key = process.env.SERPAPI_KEY;
  if (!key || !town) return { today: [], yesterday: [] };
  const k = (d: string) => `events:${country}:${town.toLowerCase()}:${d}`;
  // SerpApi has no "yesterday" filter, so yesterday's list is whatever we cached yesterday.
  const yesterday = (await kvGet<Listed[]>(k(day(-1)))) ?? [];
  const cached = await kvGet<Listed[]>(k(day()));
  if (cached) return { today: cached, yesterday };

  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({ engine: "google_events", q: `Events in ${town}`, htichips: "date:today", hl: "en", gl: country, api_key: key }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`SerpApi ${res.status}`);
    const j = (await res.json()) as { events_results?: SerpEvent[] };
    const today = (j.events_results ?? [])
      .filter((e) => e.title)
      .slice(0, 10)
      .map((e) => ({ title: e.title!, venue: e.venue?.name ?? e.address?.[0]?.split(",")[0] ?? null, address: e.address ?? [], when: e.date?.when ?? "" }));
    await kvSet(k(day()), today, 36 * 60 * 60);
    return { today, yesterday };
  } catch (e) {
    // Don't spend a search on every plan while the key or plan is wrong: try again in an hour.
    console.warn("[events]", String(e));
    await kvSet(k(day()), [], 60 * 60);
    return { today: [], yesterday };
  }
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-zÀ-ɏ']{4,}/g) ?? []);
const GENERIC = new Set(["park", "stadium", "centre", "center", "hall", "club", "ground", "grounds", "arena", "road", "street"]);

/** A mapped place whose name shares a distinctive word with the venue ("Pearse Stadium" ↔ "Pearse Stadium pitch"). */
export function matchVenue(venue: string, area: AreaData, town: string | null = null): LatLng | null {
  const townWords = words(town ?? "");
  const want = [...words(venue)].filter((w) => !GENERIC.has(w) && !townWords.has(w));
  if (!want.length) return null;
  const named = [...area.parks, ...area.features, ...area.sources].filter((p) => p.name);
  for (const p of named) {
    const have = words(p.name!);
    if (want.every((w) => have.has(w)) || (want.length > 1 && want.filter((w) => have.has(w)).length >= 2)) return { lat: p.lat, lon: p.lon };
  }
  return null;
}

async function geocode(venue: string, town: string, area: AreaData): Promise<LatLng | null> {
  const key = `venue:${town.toLowerCase()}:${venue.toLowerCase()}`;
  const hit = await kvGet<LatLng | { none: true }>(key);
  if (hit) return "none" in hit ? null : hit;
  const [s, w, n, e] = bbox(area.center, area.radiusM);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&bounded=1&viewbox=${w},${n},${e},${s}&q=${encodeURIComponent(`${venue}, ${town}`)}`;
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(5_000) });
    const [first] = (await res.json()) as { lat: string; lon: string }[];
    const at = first ? { lat: +first.lat, lon: +first.lon } : null;
    await kvSet(key, at ?? { none: true }, 30 * 24 * 60 * 60);
    return at;
  } catch {
    return null;
  }
}

/** Put events on the map: by name against OpenStreetMap first, then (a few, politely) through Nominatim. */
export async function locateEvents(listed: { today: Listed[]; yesterday: Listed[] }, town: string | null, area: AreaData): Promise<LocalEvent[]> {
  const out: LocalEvent[] = [];
  let lookups = 0;
  for (const [when, list] of [["today", listed.today], ["yesterday", listed.yesterday]] as const) {
    for (const ev of list) {
      if (!ev.venue) continue;
      let at = matchVenue(ev.venue, area, town);
      if (!at && town && lookups < 3) {
        // Nominatim asks for at most one request a second.
        if (lookups++) await new Promise((r) => setTimeout(r, 1100));
        at = await geocode(ev.venue, town, area);
      }
      if (at && haversine(at, area.center) <= area.radiusM + 500) out.push({ title: shortTitle(ev.title), venue: ev.venue, day: when, ...at });
    }
  }
  return out;
}

/** "Galway United vs Derry City | SSE Airtricity League" → "Galway United vs Derry City". */
export const shortTitle = (t: string) => t.split(/\s[|–—-]\s|:\s/)[0].trim().slice(0, 60);
