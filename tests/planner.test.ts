import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { guardPlan } from "@/lib/ai/guard";
import { plannerPrompt } from "@/lib/ai/prompts";
import { distinctLabels, prepare, shortName, type PlanRequest } from "@/lib/plan/pipeline";
import { askedForReturnPoint, fits } from "@/lib/plan/select";
import { SCHEMES } from "@/lib/countries";
import type { AreaData, Hotspot } from "@/lib/plan/types";

const galway = JSON.parse(readFileSync("data/galway.json", "utf8")) as AreaData;
const terryland = { lat: 53.2845, lon: -9.042 };
const req = (intent: string, minutes = 45): PlanRequest => ({ start: terryland, minutes, intent, donate: false, weekday: 0 });

describe("the finish the walker asks for", () => {
  it("finds the named shop, preferring a mapped machine", () => {
    // The nearest Tesco is a shop; the mapped Tesco machine is 2 km further, too far to prefer.
    expect(askedForReturnPoint("finish at Tesco", terryland, galway.returnPoints)?.name).toBe("Tesco");
    // Standing by the Tesco with a machine, the machine wins over the shop record beside it.
    expect(askedForReturnPoint("finish at Tesco", { lat: 53.2854, lon: -9.0125 }, galway.returnPoints)?.name).toBe("Tesco return machine");
    expect(askedForReturnPoint("end at lidl please", terryland, galway.returnPoints)?.name).toBe("Lidl");
    expect(askedForReturnPoint("stay off the main road", terryland, galway.returnPoints)).toBeNull();
    expect(askedForReturnPoint("finish at a return machine", terryland, galway.returnPoints)).toBeNull();
  });

  it("offers the named shop and makes it the default even when it isn't one of the nearest", () => {
    const p = prepare(galway, req("finish at Lidl", 30), SCHEMES.ie, null);
    const lidl = p.returnPoints.find((r) => r.name === "Lidl");
    expect(lidl).toBeDefined();
    expect(p.fallback.returnPointId).toBe(lidl!.id);
  });

  it("works out stops that fit for every finish on offer, and offers those stops to Gemma", () => {
    const p = prepare(galway, req("finish at Tesco"), SCHEMES.ie, null);
    for (const rp of p.returnPoints) {
      const stops = p.routes[rp.id].map((id) => p.hotspots.find((h) => h.id === id)!);
      expect(stops.every(Boolean)).toBe(true);
      if (stops.length) expect(fits(45, terryland, stops, rp, 1.15)).toBe(true);
    }
    const prompt = plannerPrompt(p.plannerInput);
    expect(prompt).toMatch(/at most [\d.]+ km in all/);
    expect(prompt).toMatch(/fits with stops \[/);
  });
});

describe("guard with precomputed routes", () => {
  it("swaps a too-long pick for the best route to the same finish", () => {
    const p = prepare(galway, req("finish at Tesco"), SCHEMES.ie, null);
    const tesco = p.fallback.returnPointId;
    const farthest = [...p.hotspots].sort((a, b) => b.distM - a.distM).slice(0, 3);
    const g = guardPlan(
      { title: "Long", stops: farthest.map((h) => ({ id: h.id, why: "" })), returnPointId: tesco, lookFor: "", tip: "" },
      { start: terryland, minutes: 45, hotspots: p.hotspots, returnPoints: p.returnPoints, fallback: p.fallback, routes: p.routes, defaultTitle: "Default" },
    );
    expect(g.flags).toContain("too_long");
    expect(g.returnPointId).toBe(tesco);
    expect(g.stopIds.length).toBeGreaterThanOrEqual(p.routes[tesco].length);
  });
});

describe("stop names", () => {
  const h = (id: string, lat: number, lon: number, label: string): Hotspot => ({ id, lat, lon, label, kinds: {}, nearbySources: 0, expected: 1, score: 1, reasons: [] });

  it("names two stops with the same label by which end of the place they are at", () => {
    const out = distinctLabels([h("a", 53.29, -9.04, "Pitch, Wildflower Meadow"), h("b", 53.285, -9.041, "Pitch, Wildflower Meadow"), h("c", 53.28, -9.05, "Benches, Eyre Square")]);
    expect(out.map((x) => x.label)).toEqual(["Pitch, north end of Wildflower Meadow", "Pitch, south end of Wildflower Meadow", "Benches, Eyre Square"]);
    expect(shortName(out[0].label)).toBe("the north end of Wildflower Meadow");
  });

  it("never offers Gemma two stops with the same name", () => {
    for (const start of [terryland, { lat: 53.2745, lon: -9.049 }, { lat: 53.2685, lon: -9.0575 }]) {
      const p = prepare(galway, { ...req(""), start, minutes: 60 }, SCHEMES.ie, null);
      const labels = p.hotspots.map((x) => x.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe("real route against the time", () => {
  it("drops the least promising stop when the real path is too long, and stops at one", async () => {
    const { routeWithinTime } = await import("@/lib/plan/route");
    const p = prepare(galway, req("", 30), SCHEMES.ie, null);
    const g = { stopIds: p.fallback.stopIds, returnPointId: p.fallback.returnPointId, why: {}, title: "t", lookFor: "", tip: "", flags: [] };
    expect(g.stopIds.length).toBe(2);
    // A river in the way: every route takes 20 minutes per stop.
    const slow = async (pts: { lat: number; lon: number }[]) => ({ line: pts, km: 1, minutes: 20 * (pts.length - 2), from: "valhalla" as const });
    const out = await routeWithinTime(p, g, slow);
    expect(out.guarded.stopIds.length).toBe(1);
    expect(out.guarded.flags).toContain("route_too_long");
    const kept = p.hotspots.find((h) => h.id === out.guarded.stopIds[0])!.expected;
    const gone = p.hotspots.find((h) => h.id === g.stopIds.find((id) => id !== out.guarded.stopIds[0]))!.expected;
    expect(kept).toBeGreaterThanOrEqual(gone);
    // A route that fits is left alone.
    const quick = async (pts: { lat: number; lon: number }[]) => ({ line: pts, km: 1, minutes: 10, from: "valhalla" as const });
    expect((await routeWithinTime(p, g, quick)).dropped).toEqual([]);
  });
});
