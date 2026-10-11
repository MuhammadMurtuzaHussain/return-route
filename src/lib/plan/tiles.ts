import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { inRing } from "./geo";
import { bbox } from "./overpass";
import type { AreaData, Feature, FeatureKind, LatLng, Park, ReturnPoint, Source, SourceKind } from "./types";

// Map data from OpenFreeMap's vector tiles: OpenStreetMap, cut into tiles and
// served from a CDN built for heavy traffic (the same tiles the app's map
// draws). The public Overpass server turns busy cloud addresses away and is
// overloaded at peak times; the tiles aren't. Their points of interest carry
// what the planner scores (pitches, playgrounds, picnic sites, bins, pubs,
// off-licences, supermarkets, parks) anywhere in Europe. What they lack,
// mapped deposit return machines, comes from a small Overpass query on top.

const TILEJSON = "https://tiles.openfreemap.org/planet";
const Z = 14;
/** A 90-minute walk needs about 8 × 8 tiles; anything bigger is a mistake. */
const MAX_TILES = 100;

let template: { url: string; until: number } | null = null;

/** The tile URL changes with each weekly build, so read it from the TileJSON (and remember it for a few hours). */
async function tileTemplate(): Promise<string> {
  if (template && Date.now() < template.until) return template.url;
  const j = (await (await fetch(TILEJSON, { signal: AbortSignal.timeout(8_000) })).json()) as { tiles: string[] };
  template = { url: j.tiles[0], until: Date.now() + 6 * 60 * 60 * 1000 };
  return template.url;
}

const lonToX = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const latToY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z);
};

type Props = { class?: string; subclass?: string; name?: string };

const NOT_A_HANGOUT = /karting|motocross|motor|equestrian|horse|golf|shooting|racing|ice_hockey|ice_stock/;

/** OpenMapTiles' poi classes, mapped onto the kinds the planner scores. */
export function tileFeatureKind({ class: c, subclass: s }: Props): FeatureKind | null {
  if (c === "picnic_site" || s === "picnic_table") return "picnic";
  if (s === "bbq") return "bbq";
  if (s === "skateboard" || c === "skateboard") return "skate";
  // Go-kart tracks and golf courses are pitches on the map, but nobody sits out on one with a can.
  if (c === "pitch" && s && NOT_A_HANGOUT.test(s)) return null;
  if (c === "pitch" || c === "stadium") return "pitch";
  if (c === "playground") return "playground";
  if (s === "viewpoint") return "viewpoint";
  if (c === "beach" || s === "beach") return "beach";
  if (s === "bench") return "bench";
  if (s === "waste_basket") return "bin";
  if (c === "shelter") return "shelter";
  return null;
}

export function tileSourceKind({ class: c, subclass: s }: Props): SourceKind | null {
  if (c === "alcohol_shop") return "offlicence";
  if (s === "convenience") return "convenience";
  if (s === "fast_food") return "takeaway";
  if (s === "pub" || c === "bar" || c === "beer") return "pub";
  return null;
}

/**
 * School and childcare grounds in one tile, as outlines. Pitches and picnic
 * tables inside them aren't stops: the gates are locked (see closedGrounds in
 * overpass.ts). Tiles don't carry access tags, so this is the whole check here.
 */
function schoolGrounds(t: VectorTile, x: number, y: number): LatLng[][] {
  const layer = t.layers.landuse;
  const rings: LatLng[][] = [];
  if (!layer) return rings;
  for (let k = 0; k < layer.length; k++) {
    const f = layer.feature(k);
    if (f.properties.class !== "school" && f.properties.class !== "kindergarten") continue;
    const g = f.toGeoJSON(x, y, Z).geometry;
    const polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const [outer] of polygons) rings.push(outer.map(([lon, lat]) => ({ lat, lon })));
  }
  return rings;
}

async function tile(url: string): Promise<VectorTile | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.status === 204 || res.status === 404) return null; // empty sea or no data
      if (!res.ok) throw new Error(`${res.status}`);
      return new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
    } catch {
      // one more try, then count it as missing
    }
  }
  throw new Error(`tile unavailable: ${url}`);
}

export async function fetchAreaFromTiles(center: LatLng, radiusM: number): Promise<AreaData> {
  const [s, w, n, e] = bbox(center, radiusM);
  const xs = [lonToX(w), lonToX(e)];
  const ys = [latToY(n), latToY(s)];
  const coords: [number, number][] = [];
  for (let x = xs[0]; x <= xs[1]; x++) for (let y = ys[0]; y <= ys[1]; y++) coords.push([x, y]);
  if (coords.length > MAX_TILES) throw new Error(`area too big: ${coords.length} tiles`);

  const url = await tileTemplate();
  const tiles: (VectorTile | null)[] = [];
  // Eight at a time: quick from a CDN, and polite.
  for (let i = 0; i < coords.length; i += 8) {
    tiles.push(...(await Promise.all(coords.slice(i, i + 8).map(([x, y]) => tile(url.replace("{z}", String(Z)).replace("{x}", String(x)).replace("{y}", String(y)))))));
  }

  const features: Feature[] = [];
  const sources: Source[] = [];
  const parks: Park[] = [];
  const returnPoints: ReturnPoint[] = [];
  tiles.forEach((t, i) => {
    const poi = t?.layers.poi;
    if (!t || !poi) return;
    const [x, y] = coords[i];
    const closed = schoolGrounds(t, x, y);
    for (let k = 0; k < poi.length; k++) {
      const f = poi.feature(k);
      const p = f.properties as Props;
      const g = f.toGeoJSON(x, y, Z).geometry;
      if (g.type !== "Point") continue;
      const [lon, lat] = g.coordinates;
      if (lat < s || lat > n || lon < w || lon > e) continue;
      // Tiles overlap a little at the edges. Read each place from the tile it's in: that
      // counts it once, and that tile has the whole school outline around it, not a sliver.
      if (lonToX(lon) !== x || latToY(lat) !== y) continue;
      const id = `t${f.id ?? `${lat.toFixed(6)},${lon.toFixed(6)}`}`;
      const name = typeof p.name === "string" && p.name ? p.name : undefined;

      if (p.subclass === "supermarket") {
        returnPoints.push({ id, lat, lon, name: name ?? "Supermarket", confidence: "shop" });
      } else if (p.class === "park" && name) {
        parks.push({ id, lat, lon, name });
      } else {
        const sk = tileSourceKind(p);
        if (sk) sources.push({ id, lat, lon, kind: sk, name });
        else {
          const fk = tileFeatureKind(p);
          if (fk && !closed.some((r) => inRing({ lat, lon }, r))) features.push({ id, lat, lon, kind: fk, name });
        }
      }
    }
  });

  return { center, radiusM, features, sources, parks, returnPoints, fetchedAt: new Date().toISOString(), from: "tiles" };
}
