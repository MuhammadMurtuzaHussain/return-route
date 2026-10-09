"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { PlanResult } from "@/lib/plan/pipeline";

// MapLibre + OpenFreeMap: open source renderer, open OpenStreetMap tiles, no key.

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

function prefersDark() {
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function marker(label: string, kind: "start" | "stop" | "end") {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  if (kind === "start") {
    el.style.cssText = "width:16px;height:16px;border-radius:999px;background:var(--surface);border:4px solid var(--post);box-shadow:0 0 0 2px var(--surface);";
    return el;
  }
  // Diamond waymarks: yellow for stops, the post colour for where you cash in.
  el.style.cssText = "width:30px;height:30px;display:grid;place-items:center;position:relative;";
  const d = document.createElement("span");
  d.style.cssText = `position:absolute;inset:4px;transform:rotate(45deg);border-radius:4px;background:${kind === "stop" ? "var(--mark)" : "var(--post)"};box-shadow:0 0 0 2px var(--surface);`;
  const t = document.createElement("span");
  t.textContent = label;
  t.style.cssText = `position:relative;font:600 12px/1 var(--font-plex-mono),monospace;color:${kind === "stop" ? "var(--on-mark)" : "var(--mark)"};`;
  el.append(d, t);
  return el;
}

export function RouteMap({ plan, className }: { plan: PlanResult; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      if (cancelled || !box.current) return;
      const dark = prefersDark();
      const css = getComputedStyle(document.documentElement);
      const line = css.getPropertyValue("--mark").trim() || "#e5b53b";
      const casing = css.getPropertyValue("--post").trim() || "#1d1d1a";

      const m = new maplibre.Map({
        container: box.current,
        style: dark ? STYLE.dark : STYLE.light,
        center: [plan.start.lon, plan.start.lat],
        zoom: 14,
        attributionControl: { compact: true },
        cooperativeGestures: true,
      });
      map.current = m;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __map: MlMap }).__map = m;

      const addRoute = () => {
        if (m.getSource("route")) return;
        m.addSource("route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: plan.route.line.map((p) => [p.lon, p.lat]) } },
        });
        m.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": casing, "line-width": 9, "line-opacity": 0.95 }, layout: { "line-cap": "round", "line-join": "round" } });
        m.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: { "line-color": line, "line-width": 5, ...(plan.route.from === "straight" ? { "line-dasharray": [1.5, 1.5] } : {}) },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      };
      // A cached style can finish loading before we get here.
      if (m.isStyleLoaded()) addRoute();
      else m.once("load", addRoute);

      new maplibre.Marker({ element: marker("", "start") }).setLngLat([plan.start.lon, plan.start.lat]).addTo(m);
      plan.stops.forEach((s, i) => new maplibre.Marker({ element: marker(String(i + 1), "stop") }).setLngLat([s.lon, s.lat]).addTo(m));
      new maplibre.Marker({ element: marker("€", "end") }).setLngLat([plan.returnPoint.lon, plan.returnPoint.lat]).addTo(m);

      const pts = [plan.start, ...plan.stops, plan.returnPoint, ...plan.route.line];
      const lons = pts.map((p) => p.lon);
      const lats = pts.map((p) => p.lat);
      m.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 36, duration: 0, maxZoom: 16 },
      );
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [plan]);

  return <div ref={box} className={className} role="img" aria-label={`Map of the walk: ${plan.stops.length} stops, finishing at ${plan.returnPoint.name}`} />;
}
