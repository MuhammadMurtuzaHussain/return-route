// Save an OpenStreetMap snapshot so the demo works when Overpass is busy.
// Usage: pnpm snapshot galway 53.2790 -9.0450 3500
import { writeFileSync, mkdirSync } from "node:fs";
import { fetchArea } from "../src/lib/plan/overpass";

const [name = "galway", lat = "53.2790", lon = "-9.0450", radius = "3500"] = process.argv.slice(2);

for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    const area = await fetchArea({ lat: Number(lat), lon: Number(lon) }, Number(radius), AbortSignal.timeout(60_000));
    const snap = { ...area, from: "snapshot" as const };
    mkdirSync("data", { recursive: true });
    writeFileSync(`data/${name}.json`, JSON.stringify(snap));
    const machines = area.returnPoints.filter((r) => r.confidence === "machine").length;
    console.log(
      `${name}: ${area.features.length} features, ${area.sources.length} sources, ${area.parks.length} parks, ` +
        `${area.returnPoints.length} return points (${machines} mapped machines)`,
    );
    process.exit(0);
  } catch (e) {
    console.error(`attempt ${attempt}: ${e}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}
process.exit(1);
