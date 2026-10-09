// How well does each Gemma tier read a haul photo?
//
// Put photos in eval/hauls/ and the true counts in eval/hauls/truth.json:
//   { "haul-01.jpg": { "eligible": 14, "total": 17 }, ... }
// "eligible" = containers the machine would pay for; "total" = all drink containers.
//
// Usage:  pnpm eval                              (MODEL_PROVIDER / model from .env.local)
//         MODEL_PROVIDER=google pnpm eval
//         OLLAMA_MODEL=gemma4:12b pnpm eval
// The phone tier runs in the browser, so it is measured there: the haul screen
// reports which model read the photo and how long it took.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { readHaulWithGemma } from "@/mastra/gemma";
import { getModelConfig } from "@/mastra/model";
import { haulTotals } from "@/lib/ai/guard";
import { SCHEMES } from "@/lib/countries";

const dir = "eval/hauls";
if (!existsSync(path.join(dir, "truth.json"))) {
  console.error(`No ${dir}/truth.json yet. Add haul photos and their true counts first.`);
  process.exit(1);
}
const truth = JSON.parse(readFileSync(path.join(dir, "truth.json"), "utf8")) as Record<string, { eligible: number; total: number }>;
const photos = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && truth[f]);
const { modelId, tier } = getModelConfig();

const rows: unknown[] = [];
let absErr = 0;
let exact = 0;
let ms = 0;
for (const f of photos) {
  const bytes = new Uint8Array(readFileSync(path.join(dir, f)));
  const type = f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const t0 = Date.now();
  try {
    const reading = await readHaulWithGemma(bytes, type, SCHEMES.ie);
    const took = Date.now() - t0;
    ms += took;
    const t = haulTotals(reading.items, SCHEMES.ie);
    const err = Math.abs(t.eligible + t.maybe - truth[f].eligible);
    absErr += err;
    if (err === 0) exact++;
    rows.push({ photo: f, truth: truth[f], counted: t.counted, eligible: t.eligible, maybe: t.maybe, rejected: t.rejected, ms: took });
    console.log(`${f.padEnd(18)} truth ${truth[f].eligible}  gemma ${t.eligible}+${t.maybe}?  off by ${err}  ${(took / 1000).toFixed(1)}s`);
  } catch (e) {
    rows.push({ photo: f, error: String(e) });
    console.log(`${f.padEnd(18)} ERROR ${e}`);
  }
}

const summary = {
  model: modelId,
  tier,
  photos: photos.length,
  meanAbsError: +(absErr / Math.max(1, photos.length)).toFixed(2),
  exact,
  avgSeconds: +(ms / Math.max(1, photos.length) / 1000).toFixed(1),
};
console.log("\n", summary);
mkdirSync("eval/results", { recursive: true });
writeFileSync(`eval/results/${modelId.replace(/[^a-z0-9.-]/gi, "_")}.json`, JSON.stringify({ summary, rows }, null, 2));
process.exit(0);
