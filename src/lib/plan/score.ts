import { haversine } from "./geo";
import type { AreaData, Context, FeatureKind, Hotspot, LatLng } from "./types";

// Where are the cans? There is no live litter feed, so this is an honest
// heuristic: places where people sit and drink (picnic tables, pitches,
// viewpoints, beaches) near places that sell drinks (off-licences, takeaways),
// weighted by yesterday's weather and the day of the week. Every walk the
// person logs re-weights the hotspots they visited.

/**
 * Deposit containers you might find at one such feature on an ordinary day.
 * Calibrated so an hour's walk lands around a dozen containers, in line with
 * the one public data point (the viral "2,000 bottles in 42 days" story works
 * out at roughly 19 an hour in Germany, where deposits are older and higher).
 * Every logged haul corrects these per hotspot.
 */
export const PRIOR: Record<FeatureKind, number> = {
  picnic: 0.5,
  bbq: 0.6,
  pitch: 0.6,
  playground: 0.2,
  viewpoint: 0.4,
  beach: 1.0,
  bench: 0.15,
  bin: 0.25,
  skate: 0.6,
  shelter: 0.3,
};

export const KIND_LABEL: Record<FeatureKind, [string, string]> = {
  picnic: ["Picnic table", "Picnic tables"],
  bbq: ["BBQ spot", "BBQ spots"],
  pitch: ["Pitch", "Pitches"],
  playground: ["Playground", "Playgrounds"],
  viewpoint: ["Viewpoint", "Viewpoints"],
  beach: ["Beach", "Beach"],
  bench: ["Bench", "Benches"],
  bin: ["Bin", "Bins"],
  skate: ["Skatepark", "Skatepark"],
  shelter: ["Shelter", "Shelters"],
};

/** Grid cell size in metres. Features in one cell become one stop. */
const CELL_M = 160;
const SOURCE_RADIUS_M = 250;
const PARK_RADIUS_M = 400;

export function cellId(p: LatLng): string {
  const latStep = CELL_M / 111_320;
  const lonStep = CELL_M / (111_320 * Math.cos((Math.round(p.lat * 10) / 10) * (Math.PI / 180)));
  return `g${Math.floor(p.lat / latStep)}_${Math.floor(p.lon / lonStep)}`;
}

export function weatherFactor(ctx: Context): { factor: number; reason?: string } {
  const w = ctx.weather;
  if (!w || w.yesterdayMaxC == null) return { factor: 1 };
  let f = w.yesterdayMaxC < 8 ? 0.7 : w.yesterdayMaxC < 14 ? 1 : w.yesterdayMaxC < 20 ? 1.3 : 1.6;
  if ((w.yesterdayRainMm ?? 0) >= 5) f *= 0.7;
  if ((w.yesterdaySunHours ?? 0) >= 6) f *= 1.2;
  f = Math.round(f * 100) / 100;
  const reason = f >= 1.25 ? "good weather yesterday" : f <= 0.8 ? "people stayed in yesterday" : undefined;
  return { factor: f, reason };
}

export function dayFactor(ctx: Context): { factor: number; reason?: string } {
  // Sunday and Monday mornings collect what Saturday and Sunday left behind.
  if (ctx.weekday === 0 || ctx.weekday === 1) return { factor: 1.35, reason: "after the weekend" };
  if (ctx.weekday === 6) return { factor: 1.15, reason: "Friday night" };
  return { factor: 1 };
}

export function buildHotspots(area: AreaData, ctx: Context): Hotspot[] {
  const cells = new Map<string, { pts: LatLng[]; kinds: Partial<Record<FeatureKind, number>>; names: string[] }>();
  for (const f of area.features) {
    const id = cellId(f);
    const c = cells.get(id) ?? { pts: [], kinds: {}, names: [] };
    c.pts.push(f);
    c.kinds[f.kind] = (c.kinds[f.kind] ?? 0) + 1;
    if (f.name) c.names.push(f.name);
    cells.set(id, c);
  }

  const wf = weatherFactor(ctx);
  const df = dayFactor(ctx);
  const out: Hotspot[] = [];

  for (const [id, c] of cells) {
    const lat = c.pts.reduce((s, p) => s + p.lat, 0) / c.pts.length;
    const lon = c.pts.reduce((s, p) => s + p.lon, 0) / c.pts.length;
    const at = { lat, lon };

    // Ten benches are not ten times one bench: diminishing returns per kind.
    let base = 0;
    for (const [k, n] of Object.entries(c.kinds) as [FeatureKind, number][]) base += PRIOR[k] * n ** 0.7;
    // A lone bench or bin is not worth a detour.
    if (base < 0.3) continue;

    let near = 0;
    let offl = 0;
    for (const s of area.sources) {
      if (haversine(at, s) <= SOURCE_RADIUS_M) {
        near++;
        if (s.kind === "offlicence") offl++;
      }
    }
    const sourceFactor = 1 + 0.12 * Math.min(near + offl, 5);
    const learnt = ctx.history?.[id] ?? 1;

    const expected = base * sourceFactor * wf.factor * df.factor * learnt;

    const reasons: string[] = [];
    const top = (Object.entries(c.kinds) as [FeatureKind, number][]).sort((a, b) => PRIOR[b[0]] * b[1] - PRIOR[a[0]] * a[1]);
    reasons.push(top.map(([k, n]) => `${n} ${KIND_LABEL[k][n > 1 ? 1 : 0].toLowerCase()}`).join(", "));
    if (offl) reasons.push(`${offl} off-licence${offl > 1 ? "s" : ""} within ${SOURCE_RADIUS_M} m`);
    else if (near) reasons.push(`${near} shop${near > 1 ? "s" : ""} or takeaway${near > 1 ? "s" : ""} nearby`);
    if (wf.reason) reasons.push(wf.reason);
    if (df.reason) reasons.push(df.reason);
    if (learnt > 1.1) reasons.push("good haul here before");
    if (learnt < 0.9) reasons.push("quiet last time");

    const park = nearestPark(area, at);
    const [k0, n0] = top[0];
    const what = c.names[0] ?? KIND_LABEL[k0][n0 > 1 ? 1 : 0];
    const label = park && park !== what ? `${what}, ${park}` : what;

    out.push({ id, lat, lon, label, kinds: c.kinds, nearbySources: near, expected: round1(expected), score: round1(expected), reasons });
  }

  return out.sort((a, b) => b.score - a.score);
}

function nearestPark(area: AreaData, at: LatLng): string | undefined {
  let best: { d: number; name: string } | undefined;
  for (const p of area.parks) {
    const d = haversine(at, p);
    if (d <= PARK_RADIUS_M && (!best || d < best.d)) best = { d, name: p.name };
  }
  return best?.name;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
