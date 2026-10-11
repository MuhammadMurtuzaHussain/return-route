// How often does the guard have to overrule Gemma's plan, per tier?
//
// Plans the same walks from the Galway snapshot (no network for map data, so
// runs are comparable) and counts guard flags. Run it before and after a
// prompt change to see whether the change helped.
//
// Usage:  pnpm eval:plan                          (MODEL_PROVIDER / model from .env.local)
//         MODEL_PROVIDER=google pnpm eval:plan
//         pnpm eval:plan -- --label before
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pickWithGemma } from "@/mastra/gemma";
import { getModelConfig } from "@/mastra/model";
import { guardPlan } from "@/lib/ai/guard";
import { prepare, type PlanRequest } from "@/lib/plan/pipeline";
import { askedForReturnPoint } from "@/lib/plan/select";
import { SCHEMES } from "@/lib/countries";
import type { AreaData, Weather } from "@/lib/plan/types";

const galway = JSON.parse(readFileSync("data/galway.json", "utf8")) as AreaData;
const weather: Weather = { yesterdayMaxC: 15, yesterdayRainMm: 0, yesterdaySunHours: 6, nowC: 13, nowRainMm: 0, summary: "Yesterday was mild and sunny (15°C), it's 13°C now" };
const label = process.argv.includes("--label") ? process.argv[process.argv.indexOf("--label") + 1] : "run";

const START = {
  terryland: { lat: 53.2845, lon: -9.042 },
  eyreSquare: { lat: 53.2745, lon: -9.049 },
  university: { lat: 53.279, lon: -9.06 },
  claddagh: { lat: 53.2685, lon: -9.0575 },
};
const CASES: { start: keyof typeof START; minutes: number; intent: string }[] = [
  { start: "terryland", minutes: 45, intent: "" },
  { start: "terryland", minutes: 45, intent: "finish at Tesco" },
  { start: "terryland", minutes: 30, intent: "finish at Lidl" },
  { start: "eyreSquare", minutes: 60, intent: "" },
  { start: "eyreSquare", minutes: 30, intent: "finish at Aldi" },
  { start: "university", minutes: 60, intent: "finish at Dunnes" },
  { start: "claddagh", minutes: 45, intent: "" },
  { start: "claddagh", minutes: 60, intent: "finish at Tesco, stay off the main road" },
];

const { modelId, tier } = getModelConfig();
const rows: unknown[] = [];
const counts: Record<string, number> = {};
let clean = 0;
let asked = 0;
let honoured = 0;
let ms = 0;
const brand = (name: string) => name.toLowerCase().split(/\s/)[0];
for (const c of CASES) {
  const req: PlanRequest = { start: START[c.start], minutes: c.minutes, intent: c.intent, donate: false, weekday: 0 };
  const p = prepare(galway, req, SCHEMES.ie, weather);
  const t0 = Date.now();
  let pick = null;
  try {
    pick = await pickWithGemma(p.plannerInput);
  } catch (e) {
    console.log("  error:", String(e).slice(0, 120));
  }
  const took = Date.now() - t0;
  ms += took;
  const g = guardPlan(pick, { start: req.start, minutes: req.minutes, hotspots: p.hotspots, returnPoints: p.returnPoints, fallback: p.fallback, defaultTitle: p.defaultTitle, routes: p.routes });
  const rules = g.flags.map((f) => f.split(":")[0]);
  for (const r of rules) counts[r] = (counts[r] ?? 0) + 1;
  if (!rules.length) clean++;
  const finish = p.returnPoints.find((r) => r.id === g.returnPointId)?.name;
  // Did the walk end at the shop they named? Checked against every return point on the map, not just the ones offered.
  const wanted = askedForReturnPoint(c.intent, req.start, galway.returnPoints);
  if (wanted) {
    asked++;
    if (finish && brand(finish) === brand(wanted.name)) honoured++;
    else rules.push("ignored_finish");
  }
  const labels = g.stopIds.map((id) => p.hotspots.find((h) => h.id === id)?.label);
  rows.push({ ...c, flags: g.flags, title: g.title, stops: labels, finish, ms: took });
  console.log(`${c.start.padEnd(10)} ${String(c.minutes).padStart(3)} min  ${(c.intent || "-").padEnd(40)} → ${finish?.padEnd(28)} ${rules.join(",") || "clean"}  ${(took / 1000).toFixed(1)}s`);
}

const summary = { label, model: modelId, tier, cases: CASES.length, clean, flags: counts, finishHonoured: `${honoured}/${asked}`, avgSeconds: +(ms / CASES.length / 1000).toFixed(1) };
console.log("\n", summary);
mkdirSync("eval/results", { recursive: true });
writeFileSync(`eval/results/plan-${label}-${modelId.replace(/[^a-z0-9.-]/gi, "_")}.json`, JSON.stringify({ summary, rows }, null, 2));
process.exit(0);
