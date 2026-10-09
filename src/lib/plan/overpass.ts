import type { AreaData, Feature, FeatureKind, LatLng, Park, ReturnPoint, Source, SourceKind } from "./types";

// Everything Return Route knows about a place comes from OpenStreetMap through
// the Overpass API. Public Overpass servers are busy and sometimes fail, so we
// try a few mirrors and the caller falls back to a saved snapshot.

const MIRRORS = (
  process.env.OVERPASS_URLS ??
  "https://z.overpass-api.de/api/interpreter,https://overpass-api.de/api/interpreter,https://lz4.overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter"
).split(",");

export function bbox({ lat, lon }: LatLng, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((n) => +n.toFixed(5)) as [number, number, number, number];
}

// A global bbox is much cheaper for Overpass than an `around` filter on every clause.
export function buildQuery(center: LatLng, radiusM: number): string {
  return `[out:json][timeout:60][bbox:${bbox(center, radiusM).join(",")}];
(
  node[leisure=picnic_table]; nwr[tourism=picnic_site]; nwr[amenity=bbq];
  nwr[leisure=pitch]; nwr[leisure=playground]; nwr[leisure=skatepark];
  node[tourism=viewpoint]; nwr[natural=beach]; node[amenity=shelter];
  node[amenity=bench]; node[amenity=waste_basket];
  nwr[shop=alcohol]; nwr[shop=convenience]; nwr[amenity=fast_food]; nwr[amenity=pub];
  nwr[leisure=park][name]; nwr[leisure=nature_reserve][name];
  node[amenity=vending_machine][vending=bottle_return]; nwr[shop=supermarket];
);
out center tags;`;
}

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function featureKind(t: Record<string, string>): FeatureKind | null {
  if (t.leisure === "picnic_table" || t.tourism === "picnic_site") return "picnic";
  if (t.amenity === "bbq") return "bbq";
  if (t.leisure === "pitch") return "pitch";
  if (t.leisure === "playground") return "playground";
  if (t.leisure === "skatepark") return "skate";
  if (t.tourism === "viewpoint") return "viewpoint";
  if (t.natural === "beach") return "beach";
  if (t.amenity === "bench") return "bench";
  if (t.amenity === "waste_basket") return "bin";
  if (t.amenity === "shelter") return "shelter";
  return null;
}

function sourceKind(t: Record<string, string>): SourceKind | null {
  if (t.shop === "alcohol") return "offlicence";
  if (t.shop === "convenience") return "convenience";
  if (t.amenity === "fast_food") return "takeaway";
  if (t.amenity === "pub") return "pub";
  return null;
}

/** Turn raw Overpass elements into the app's own shapes. Pure, so it is tested. */
export function parseElements(elements: OsmElement[], center: LatLng, radiusM: number, from: AreaData["from"]): AreaData {
  const features: Feature[] = [];
  const sources: Source[] = [];
  const parks: Park[] = [];
  const returnPoints: ReturnPoint[] = [];

  for (const e of elements) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const id = `${e.type[0]}${e.id}`;
    const name = t.name;

    if (t.vending === "bottle_return") {
      returnPoints.push({ id, lat, lon, name: t.operator ?? t.brand ?? name ?? "Return machine", confidence: "machine" });
      continue;
    }
    if (t.shop === "supermarket") {
      returnPoints.push({ id, lat, lon, name: name ?? t.brand ?? "Supermarket", confidence: "shop" });
      continue;
    }
    if ((t.leisure === "park" || t.leisure === "nature_reserve") && name) {
      parks.push({ id, lat, lon, name });
      continue;
    }
    const sk = sourceKind(t);
    if (sk) {
      sources.push({ id, lat, lon, kind: sk, name });
      continue;
    }
    const fk = featureKind(t);
    if (fk) features.push({ id, lat, lon, kind: fk, name });
  }

  // Machines are usually tagged with the operator ("Re-turn"), not a place.
  // Name them after the shop they stand in or beside.
  const shops = returnPoints.filter((r) => r.confidence === "shop");
  for (const m of returnPoints) {
    if (m.confidence !== "machine") continue;
    const host = shops
      .map((s) => ({ s, d: Math.hypot((s.lat - m.lat) * 111_320, (s.lon - m.lon) * 111_320 * Math.cos((m.lat * Math.PI) / 180)) }))
      .filter((x) => x.d <= 120)
      .sort((a, b) => a.d - b.d)[0];
    if (host) m.name = `${host.s.name} return machine`;
    else if (!/machine/i.test(m.name)) m.name = `${m.name} return machine`;
  }

  return { center, radiusM, features, sources, parks, returnPoints, fetchedAt: new Date().toISOString(), from };
}

export async function fetchArea(center: LatLng, radiusM: number, signal?: AbortSignal): Promise<AreaData> {
  const body = new URLSearchParams({ data: buildQuery(center, radiusM) });
  let lastError: unknown = null;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: { "User-Agent": "ReturnRoute/0.1 (+https://github.com/MuhammadMurtuzaHussain/return-route)" },
        signal: signal ?? AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`${url} → ${res.status}`);
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) throw new Error(`${url} → not JSON`);
      const json = JSON.parse(text) as { elements: OsmElement[]; remark?: string };
      if (json.remark && json.elements.length === 0) throw new Error(`${url} → ${json.remark}`);
      return parseElements(json.elements, center, radiusM, "overpass");
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Overpass unavailable: ${String(lastError)}`);
}
