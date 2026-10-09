import type { LatLng } from "./types";

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Straight-line distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Footpaths wind; straight lines underestimate a walk by about this much. */
export const DETOUR = 1.3;

/** Comfortable walking pace with stops to look around, metres per minute. */
export const WALK_M_PER_MIN = 75;

/** Minutes spent at each stop picking things up. */
export const DWELL_MIN = 5;

export function pathLength(points: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  return d;
}

/** Google's encoded polyline format, precision 6 (what Valhalla returns). */
export function decodePolyline(str: string, precision = 6): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let lat = 0;
  let lon = 0;
  let i = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lon += delta;
    }
    out.push({ lat: lat / factor, lon: lon / factor });
  }
  return out;
}
