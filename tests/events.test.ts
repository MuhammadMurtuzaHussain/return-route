import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildHotspots, eventFactor } from "@/lib/plan/score";
import { matchVenue, shortTitle } from "@/lib/server/events";
import { kvGet, kvHit, kvSet } from "@/lib/server/kv";
import type { AreaData, Context, LocalEvent } from "@/lib/plan/types";

const galway = JSON.parse(readFileSync("data/galway.json", "utf8")) as AreaData;
const ctx: Context = { weather: null, weekday: 3 };

describe("events", () => {
  const park = galway.parks[0];
  const ev: LocalEvent = { title: "Market day", venue: park.name, day: "today", lat: park.lat, lon: park.lon };

  it("boosts hotspots near a venue and says why", () => {
    expect(eventFactor(park, { ...ctx, events: [ev] })).toEqual({ factor: 1.3, reason: `Market day at ${park.name} today` });
    expect(eventFactor(park, { ...ctx, events: [{ ...ev, day: "yesterday" }] }).factor).toBe(1.5);
    expect(eventFactor({ lat: park.lat + 0.05, lon: park.lon }, { ...ctx, events: [ev] }).factor).toBe(1);
  });

  it("raises the expected haul only around the event", () => {
    const before = buildHotspots(galway, ctx);
    const after = buildHotspots(galway, { ...ctx, events: [ev] });
    const boosted = after.filter((h) => h.reasons.some((r) => r.includes("Market day")));
    expect(boosted.length).toBeGreaterThan(0);
    for (const h of boosted) expect(h.expected).toBeGreaterThan(before.find((b) => b.id === h.id)!.expected);
  });

  it("finds a venue on the map by its distinctive words, not by 'park' or the town", () => {
    expect(matchVenue(park.name, galway, "Galway")).toEqual({ lat: park.lat, lon: park.lon });
    expect(matchVenue("The Park", galway)).toBeNull();
    expect(matchVenue("Galway", galway, "Galway")).toBeNull();
  });

  it("shortens event titles", () => {
    expect(shortTitle("Galway United vs Derry City | SSE Airtricity League")).toBe("Galway United vs Derry City");
    expect(shortTitle("Oktoberfest - Live music all day")).toBe("Oktoberfest");
  });
});

describe("cache without Key Value", () => {
  it("stores, expires and counts in memory", async () => {
    await kvSet("t:a", { n: 1 }, 60);
    expect(await kvGet("t:a")).toEqual({ n: 1 });
    await kvSet("t:b", 1, -1);
    expect(await kvGet("t:b")).toBeNull();
    expect(await kvHit("t:c", 60)).toBe(1);
    expect(await kvHit("t:c", 60)).toBe(2);
  });
});
