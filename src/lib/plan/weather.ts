import type { LatLng, Weather } from "./types";

// Open-Meteo: free, open data, no key. Yesterday's weather is the useful part:
// a warm dry evening in the park is what leaves cans behind for this morning.

type OpenMeteo = {
  current?: { temperature_2m?: number; precipitation?: number };
  daily?: { temperature_2m_max?: number[]; precipitation_sum?: number[]; sunshine_duration?: number[] };
};

export function summarise(w: Omit<Weather, "summary">): string {
  const parts: string[] = [];
  if (w.yesterdayMaxC != null) {
    const feel = w.yesterdayMaxC >= 18 ? "warm" : w.yesterdayMaxC >= 12 ? "mild" : "cold";
    const wet = (w.yesterdayRainMm ?? 0) >= 3 ? "wet" : (w.yesterdaySunHours ?? 0) >= 5 ? "sunny" : "dry";
    parts.push(`Yesterday was ${feel} and ${wet} (${Math.round(w.yesterdayMaxC)}°C)`);
  }
  if (w.nowC != null) parts.push(`it's ${Math.round(w.nowC)}°C now${(w.nowRainMm ?? 0) > 0.2 ? " and raining" : ""}`);
  return parts.join(", ") || "Weather unavailable";
}

export function parseWeather(j: OpenMeteo): Weather {
  const d = j.daily ?? {};
  const w = {
    yesterdayMaxC: d.temperature_2m_max?.[0] ?? null,
    yesterdayRainMm: d.precipitation_sum?.[0] ?? null,
    yesterdaySunHours: d.sunshine_duration?.[0] != null ? d.sunshine_duration[0] / 3600 : null,
    nowC: j.current?.temperature_2m ?? null,
    nowRainMm: j.current?.precipitation ?? null,
  };
  return { ...w, summary: summarise(w) };
}

export async function fetchWeather({ lat, lon }: LatLng): Promise<Weather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&daily=temperature_2m_max,precipitation_sum,sunshine_duration&current=temperature_2m,precipitation` +
    `&past_days=1&forecast_days=1&timezone=auto`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return parseWeather(await res.json());
  } catch {
    return null;
  }
}
