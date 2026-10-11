import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractJson, guardPlan, haulTotals, namesAPlace, receiptLines, stripMoney } from "@/lib/ai/guard";
import { buildHotspots } from "@/lib/plan/score";
import { chooseRoute } from "@/lib/plan/select";
import { SCHEMES } from "@/lib/countries";
import type { AreaData } from "@/lib/plan/types";

const galway = JSON.parse(readFileSync("data/galway.json", "utf8")) as AreaData;
const start = { lat: 53.2845, lon: -9.042 };
const hotspots = buildHotspots(galway, { weather: null, weekday: 3 });
const fallback = chooseRoute(start, 60, hotspots, galway.returnPoints)!;
const ctx = { start, minutes: 60, hotspots, returnPoints: galway.returnPoints, fallback, defaultTitle: "Default" };

describe("plan guard", () => {
  it("drops stops Gemma invented", () => {
    const g = guardPlan(
      { title: "Walk", stops: [{ id: "g999_999", why: "made up" }, { id: fallback.stopIds[0], why: "real" }], returnPointId: fallback.returnPointId, lookFor: "", tip: "" },
      ctx,
    );
    expect(g.stopIds).toEqual([fallback.stopIds[0]]);
    expect(g.flags).toContain("invented_stop:g999_999");
  });

  it("replaces an invented return point", () => {
    const g = guardPlan({ title: "Walk", stops: [{ id: fallback.stopIds[0], why: "" }], returnPointId: "n123", lookFor: "", tip: "" }, ctx);
    expect(g.returnPointId).toBe(fallback.returnPointId);
    expect(g.flags).toContain("invented_return_point:n123");
  });

  it("falls back when there is no model output", () => {
    const g = guardPlan(null, ctx);
    expect(g.stopIds).toEqual(fallback.stopIds);
    expect(g.flags).toEqual(["no_model_output"]);
  });

  it("trims a route that is too long but keeps the finish the walker asked for", () => {
    const far = [...hotspots].sort((a, b) => Math.hypot(b.lat - start.lat, b.lon - start.lon) - Math.hypot(a.lat - start.lat, a.lon - start.lon)).slice(0, 3);
    const near = fallback.stopIds[0];
    const g = guardPlan({ title: "Long", stops: [{ id: near, why: "" }, ...far.map((h) => ({ id: h.id, why: "" }))], returnPointId: fallback.returnPointId, lookFor: "", tip: "" }, ctx);
    expect(g.flags).toContain("too_long");
    expect(g.returnPointId).toBe(fallback.returnPointId);
    expect(g.stopIds.length).toBeLessThan(4);
  });

  it("never lets Gemma promise money", () => {
    expect(stripMoney("Head to the park. You'll make €5 today! Gloves on.")).toBe("Head to the park. Gloves on.");
    const g = guardPlan({ title: "Earn €10 fast", stops: [], returnPointId: fallback.returnPointId, lookFor: "Easily 20 euro here.", tip: "Gloves on." }, ctx);
    expect(g.title).toBe("Default");
    expect(g.lookFor).toBe("");
  });
});

describe("haul totals", () => {
  it("prices from the table and explains what won't be paid", () => {
    const t = haulTotals(
      [
        { material: "can", ml: 330, mark: "yes", damaged: false },
        { material: "can", ml: 500, mark: "yes", damaged: false },
        { material: "pet", ml: 1500, mark: "yes", damaged: false },
        { material: "pet", ml: 500, mark: "unsure", damaged: false },
        { material: "can", ml: 330, mark: "yes", damaged: true },
        { material: "can", ml: 330, mark: "no", damaged: false },
        { material: "glass", ml: 330, mark: "yes", damaged: false },
        { material: "other", ml: 0, mark: "no", damaged: false },
      ],
      SCHEMES.ie,
    );
    expect(t.eligible).toBe(3);
    expect(t.sure).toBe(0.55);
    expect(t.maybe).toBe(1);
    expect(t.possible).toBe(0.7);
    expect(t.rejected).toEqual({ damaged: 1, noMark: 1, notInScheme: 1 });
    expect(t.counted).toBe(7);
  });
});

describe("extractJson", () => {
  it("finds JSON in fenced or chatty replies", () => {
    expect(extractJson('Sure! ```json\n{"a": {"b": "}"}}\n``` hope that helps')).toEqual({ a: { b: "}" } });
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson('{"a": 1')).toBeNull();
  });
});

describe("receipt lines", () => {
  it("groups by size band and status, priced from the table", () => {
    const lines = receiptLines(
      [
        { material: "can", ml: 330, mark: "yes", damaged: false },
        { material: "can", ml: 330, mark: "yes", damaged: false },
        { material: "pet", ml: 1500, mark: "yes", damaged: false },
        { material: "can", ml: 330, mark: "yes", damaged: true },
        { material: "glass", ml: 330, mark: "yes", damaged: false },
      ],
      SCHEMES.ie,
    );
    expect(lines[0]).toEqual({ label: "Bottle >500ML", qty: 1, unit: 0.25, amount: 0.25, status: "paid" });
    expect(lines[1]).toEqual({ label: "Can ≤500ML", qty: 2, unit: 0.15, amount: 0.3, status: "paid" });
    expect(lines.find((l) => l.status === "damaged")!.amount).toBe(0);
    expect(lines.find((l) => l.status === "not_in_scheme")!.label).toBe("Glass");
  });
});

describe("titles", () => {
  it("keeps titles that name a real place and drops generic ones", () => {
    expect(namesAPlace("Eyre Square loop", ["Kennedy Park Playground, Eyre Square"])).toBe("Eyre Square loop");
    expect(namesAPlace("Park Collections", ["Kennedy Park Playground, Eyre Square"])).toBe("");
  });
});

describe("words Gemma doesn't get to say", () => {
  it("rejects generic walk titles and turns runs into walks", async () => {
    const { walkTitle } = await import("@/lib/ai/guard");
    expect(walkTitle("Park Waste Collection")).toBe("");
    expect(walkTitle("Eyre Square Park Run")).toBe("Eyre Square Park loop");
    expect(walkTitle("Westside pitches and back")).toBe("Westside pitches and back");
  });

  it("keeps people out of bins but keeps the advice to leave them", async () => {
    const { leaveBins } = await import("@/lib/ai/guard");
    expect(leaveBins("Look under the benches. Check near the bins at the playground.")).toBe("Look under the benches.");
    expect(leaveBins("Leave bins alone, they're someone's income.")).toBe("Leave bins alone, they're someone's income.");
  });

  it("strips numbers, money and hashtags from Gemma's post line", async () => {
    const { guardPostLine } = await import("@/lib/ai/guard");
    expect(guardPostLine('"Out in the sunshine, doing my bit." I made €5 today! #green')).toBe("Out in the sunshine, doing my bit.");
  });

  it("drops the model's narration from haul notes", async () => {
    const { cleanNotes } = await import("@/lib/ai/guard");
    expect(cleanNotes("Based on the image provided, I have identified 7 drink containers. Leave the crushed can out.")).toBe("Leave the crushed can out.");
  });

  it("composes a post whose numbers come from the voucher", async () => {
    const { composePost } = await import("@/lib/client/share");
    const text = composePost({ line: "Good walk.", containers: 7, amount: 1, currency: "EUR", donated: true, cause: "the food bank", place: "Eyre Square" }, "https://x.test");
    expect(text).toContain("7 dropped cans and bottles around Eyre Square");
    expect(text).toContain("to the food bank");
    expect(text.length).toBeLessThanOrEqual(280);
  });
});
