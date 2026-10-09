// Plan one walk from the command line with whichever tier the env selects.
// Usage: MODEL_PROVIDER=google npx tsx --env-file=.env.local scripts/plan-smoke.mts [minutes] [intent]
import { mastra } from "@/mastra";
import type { Planned } from "@/mastra/workflows/planWalk";
import { getModelConfig } from "@/mastra/model";

const [minutes = "60", intent = ""] = process.argv.slice(2);
const run = await mastra.getWorkflow("planWalkWorkflow").createRun();
const out = await run.start({
  inputData: { start: { lat: 53.2845, lon: -9.042 }, minutes: Number(minutes), intent, donate: false, weekday: new Date().getDay(), country: "ie" },
});
if (out.status !== "success") throw new Error(JSON.stringify(out));
const { result, gemmaMs } = out.result as Planned;
console.log(getModelConfig().modelId, `${gemmaMs} ms`, result?.flags);
console.log(result?.title, "\n", result?.briefing);
for (const s of result?.stops ?? []) console.log(" -", s.label, "::", s.why);
console.log(" =>", result?.returnPoint.name, result?.route.km, "km", result?.estimate);
process.exit(0);
