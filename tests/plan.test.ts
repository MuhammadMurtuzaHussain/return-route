import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildHotspots, cellId } from "@/lib/plan/score";
import { chooseRoute, fits, walkM } from "@/lib/plan/select";
import { estimate } from "@/lib/plan/estimate";
import { googleMapsUrl, toGpx } from "@/lib/plan/export";
import { decodePolyline, haversine } from "@/lib/plan/geo";
import { parseElements } from "@/lib/plan/overpass";
import { composeBriefing } from "@/lib/plan/pipeline";
import { SCHEMES, depositFor, typicalDeposit } from "@/lib/countries";
import type { AreaData, Context } from "@/lib/plan/types";

const galway = JSON.parse(readFileSync("data/galway.json", "utf8")) as AreaData;
const terryland = { lat: 53.2845, lon: -9.042 };
const ctx: Context = { weather: null, weekday: 3 };

describe("deposit table", () => {
  it("pays Irish rates by size", () => {
    expect(depositFor(SCHEMES.ie, "can", 330)).toBe(0.15);
    expect(depositFor(SCHEMES.ie, "pet", 500)).toBe(0.15);
    expect(depositFor(SCHEMES.ie, "pet", 1500)).toBe(0.25);
  });
  it("pays nothing for glass in Ireland or outside the size range", () => {
    expect(depositFor(SCHEMES.ie, "glass", 330)).toBe(0);
    expect(depositFor(SCHEMES.ie, "can", 100)).toBe(0);
  });
  it("uses a flat 25 cents in Germany", () => {
    expect(depositFor(SCHEMES.de, "can", 330)).toBe(0.25);
    expect(depositFor(SCHEMES.de, "pet", 1500)).toBe(0.25);
    expect(typicalDeposit(SCHEMES.de)).toBe(0.25);
  });
});

describe("hotspots", () => {
  const hs = buildHotspots(galway, ctx);
  it("finds and ranks hotspots in the Galway snapshot", () => {
    expect(hs.length).toBeGreaterThan(20);
    for (let i = 1; i < hs.length; i++) expect(hs[i - 1].score).toBeGreaterThanOrEqual(hs[i].score);
  });
  it("has stable ids so learning carries over between walks", () => {
    expect(cellId({ lat: 53.2845, lon: -9.042 })).toBe(cellId({ lat: 53.28451, lon: -9.04201 }));
  });
  it("scores higher after a warm weekend", () => {
    const warmMonday = buildHotspots(galway, { weekday: 1, weather: { yesterdayMaxC: 22, yesterdayRainMm: 0, yesterdaySunHours: 8, nowC: 18, nowRainMm: 0, summary: "" } });
    expect(warmMonday[0].expected).toBeGreaterThan(hs[0].expected);
  });
  it("learns from history", () => {
    const top = hs[0];
    const boosted = buildHotspots(galway, { ...ctx, history: { [top.id]: 2 } });
    expect(boosted.find((h) => h.id === top.id)!.expected).toBeCloseTo(top.expected * 2, 0);
  });
});

describe("route choice", () => {
  const hs = buildHotspots(galway, ctx);
  for (const minutes of [30, 60, 90]) {
    it(`fits a ${minutes}-minute walk`, () => {
      const c = chooseRoute(terryland, minutes, hs, galway.returnPoints)!;
      expect(c.stopIds.length).toBeGreaterThan(0);
      expect(c.stopIds.length).toBeLessThanOrEqual(3);
      const stops = c.stopIds.map((id) => hs.find((h) => h.id === id)!);
      const rp = galway.returnPoints.find((r) => r.id === c.returnPointId)!;
      expect(fits(minutes, terryland, stops, rp)).toBe(true);
    });
  }
  it("walks further with more time", () => {
    const len = (m: number) => {
      const c = chooseRoute(terryland, m, hs, galway.returnPoints)!;
      return walkM(terryland, c.stopIds.map((id) => hs.find((h) => h.id === id)!), galway.returnPoints.find((r) => r.id === c.returnPointId)!);
    };
    expect(len(90)).toBeGreaterThan(len(30));
  });
});

describe("estimate", () => {
  it("is a range priced from the deposit table", () => {
    const hs = buildHotspots(galway, ctx).slice(0, 3);
    const e = estimate(hs, 4, SCHEMES.ie);
    expect(e.containersHigh).toBeGreaterThan(e.containersLow);
    expect(e.moneyHigh).toBeCloseTo(e.containersHigh * typicalDeposit(SCHEMES.ie), 2);
    expect(e.currency).toBe("EUR");
  });
});

describe("export", () => {
  const start = { lat: 53.2845, lon: -9.042 };
  const stops = [
    { lat: 53.27, lon: -9.05 },
    { lat: 53.275, lon: -9.055 },
  ];
  const end = { lat: 53.281, lon: -9.0499 };
  it("builds a walking Google Maps link with waypoints", () => {
    const u = new URL(googleMapsUrl(start, stops, end));
    expect(u.hostname).toBe("www.google.com");
    expect(u.searchParams.get("api")).toBe("1");
    expect(u.searchParams.get("travelmode")).toBe("walking");
    expect(u.searchParams.get("waypoints")).toBe("53.270000,-9.050000|53.275000,-9.055000");
    expect(u.searchParams.get("destination")).toBe("53.281000,-9.049900");
  });
  it("writes valid-looking GPX and escapes names", () => {
    const gpx = toGpx("Tom & Jerry's walk", [{ ...end, name: "Return <machine>" }], [start, ...stops, end]);
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain("Tom &amp; Jerry&apos;s walk");
    expect(gpx).toContain("Return &lt;machine&gt;");
    expect(gpx.match(/<trkpt/g)).toHaveLength(4);
  });
});

describe("briefing", () => {
  it("names real places from the map, in order", () => {
    const b = composeBriefing({ startNear: "Terryland Forest Park", stops: ["Eyre Square", "Fisheries Field"], returnPoint: "Aldi return machine", donate: true, lookFor: "", tip: "Gloves on" });
    expect(b).toBe(
      "From Terryland Forest Park, head to Eyre Square first, then Fisheries Field. Check under benches, along hedges and around the bins as you go. Finish at Aldi return machine and donate the refund. Gloves on.",
    );
  });
});

describe("geo", () => {
  it("measures distance", () => {
    expect(haversine({ lat: 53.2745, lon: -9.049 }, { lat: 53.284, lon: -9.04 })).toBeGreaterThan(1150);
    expect(haversine({ lat: 53.2745, lon: -9.049 }, { lat: 53.284, lon: -9.04 })).toBeLessThan(1300);
  });
  it("decodes precision-6 polylines", () => {
    // Encoded from [[38.5,-120.2],[40.7,-120.95]] at precision 6.
    const pts = decodePolyline("_izlhA~rlgdF_{geC~ywl@");
    expect(pts[0].lat).toBeCloseTo(38.5, 5);
    expect(pts[1].lon).toBeCloseTo(-120.95, 5);
  });
});

describe("overpass parsing", () => {
  it("sorts elements into features, sources, parks and return points", () => {
    const a = parseElements(
      [
        { type: "node", id: 1, lat: 53.28, lon: -9.04, tags: { leisure: "picnic_table" } },
        { type: "node", id: 2, lat: 53.28, lon: -9.04, tags: { shop: "alcohol" } },
        { type: "way", id: 3, center: { lat: 53.28, lon: -9.04 }, tags: { leisure: "park", name: "Terryland Forest Park" } },
        { type: "node", id: 4, lat: 53.281, lon: -9.041, tags: { amenity: "vending_machine", vending: "bottle_return", operator: "Re-turn" } },
        { type: "way", id: 5, center: { lat: 53.2811, lon: -9.0411 }, tags: { shop: "supermarket", name: "Aldi" } },
      ],
      terryland,
      1000,
      "overpass",
    );
    expect(a.features).toHaveLength(1);
    expect(a.sources[0].kind).toBe("offlicence");
    expect(a.parks[0].name).toBe("Terryland Forest Park");
    expect(a.returnPoints.find((r) => r.confidence === "machine")!.name).toBe("Aldi return machine");
  });
});
