import type { LatLng } from "./types";

// Getting the walk onto the phone and then out of the way.

const ll = (p: LatLng) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

/**
 * A Google Maps directions link (Maps URLs, no API key). Opens the Maps app on
 * a phone with walking directions through each stop to the return point.
 */
export function googleMapsUrl(start: LatLng, stops: LatLng[], end: LatLng): string {
  const q = new URLSearchParams({ api: "1", origin: ll(start), destination: ll(end), travelmode: "walking" });
  if (stops.length) q.set("waypoints", stops.map(ll).join("|"));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export type GpxPoint = LatLng & { name: string; desc?: string };

/** GPX 1.1 for Strava, Komoot, OsmAnd, Organic Maps and friends. */
export function toGpx(title: string, waypoints: GpxPoint[], line: LatLng[]): string {
  const wpts = waypoints
    .map((w) => `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}"><name>${esc(w.name)}</name>${w.desc ? `<desc>${esc(w.desc)}</desc>` : ""}</wpt>`)
    .join("\n");
  const trk = line.map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Return Route" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(title)}</name></metadata>
${wpts}
  <trk>
    <name>${esc(title)}</name>
    <type>walking</type>
    <trkseg>
${trk}
    </trkseg>
  </trk>
</gpx>
`;
}
