"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { PlanResult } from "@/lib/plan/pipeline";
import { isDark } from "@/lib/client/theme";

// MapLibre + OpenFreeMap: open source renderer, open OpenStreetMap tiles, no key.

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};


function marker(label: string, kind: "start" | "stop" | "end") {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  if (kind === "start") {
    el.style.cssText = "width:16px;height:16px;border-radius:999px;background:var(--surface);border:4px solid var(--post);box-shadow:0 0 0 2px var(--surface);";
    return el;
  }
  // Diamond waymarks: yellow for stops, the post colour for where you cash in.
  // No `position` here: MapLibre positions markers absolutely, and overriding it stacks them down the page.
  el.style.cssText = "width:30px;height:30px;display:grid;place-items:center;";
  const d = document.createElement("span");
  d.style.cssText = `position:absolute;inset:4px;transform:rotate(45deg);border-radius:4px;background:${kind === "stop" ? "var(--mark)" : "var(--post)"};box-shadow:0 0 0 2px var(--surface);`;
  const t = document.createElement("span");
  t.textContent = label;
  t.style.cssText = `position:relative;font:600 12px/1 var(--font-plex-mono),monospace;color:${kind === "stop" ? "var(--on-mark)" : "var(--mark)"};`;
  el.append(d, t);
  return el;
}

/** Mark a stop as visited during the walk-through: post colour, a tick instead of the number. */
function visit(el: HTMLElement) {
  const [d, t] = el.children as unknown as [HTMLElement, HTMLElement];
  d.style.background = "var(--post)";
  t.style.color = "var(--mark)";
  t.textContent = "✓";
}

const WALK_MS = 10_000;

export function RouteMap({ plan, className, walking = false, onWalked }: { plan: PlanResult; className?: string; walking?: boolean; onWalked?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const stopEls = useRef<HTMLElement[]>([]);
  // The walk-through waits for the map: tapping Walk it straight away must still animate.
  const [ready, setReady] = useState(false);
  const done = useRef(onWalked);
  useEffect(() => {
    done.current = onWalked;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      if (cancelled || !box.current) return;
      const dark = isDark();
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
      setReady(true);
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
      stopEls.current = plan.stops.map((s, i) => {
        const el = marker(String(i + 1), "stop");
        new maplibre.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(m);
        return el;
      });
      const end = marker("€", "end");
      stopEls.current.push(end);
      new maplibre.Marker({ element: end }).setLngLat([plan.returnPoint.lon, plan.returnPoint.lat]).addTo(m);

      const pts = [plan.start, ...plan.stops, plan.returnPoint, ...plan.route.line];
      const lons = pts.map((p) => p.lon);
      const lats = pts.map((p) => p.lat);
      // The route sheet overlaps the bottom of the map, so leave more room there.
      const fit = () =>
        m.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: { top: 36, right: 36, bottom: 60, left: 36 }, duration: 0, maxZoom: 16 },
        );
      fit();
      // The map can mount before its box has its final size; refit when it settles.
      const ro = new ResizeObserver(() => {
        m.resize();
        fit();
      });
      ro.observe(box.current);
      m.once("remove", () => ro.disconnect());
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
  }, [plan]);

  // Walk the loop on the map: a dot follows the route and ticks off each stop.
  useEffect(() => {
    if (!walking || !ready) return;
    const line = plan.route.line;
    const m = map.current;
    if (!m || line.length < 2) {
      done.current?.();
      return;
    }
    const k = Math.cos((plan.start.lat * Math.PI) / 180);
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i].lat - line[i - 1].lat, (line[i].lon - line[i - 1].lon) * k));
    const total = cum[cum.length - 1] || 1;
    const nearest = (p: { lat: number; lon: number }) => {
      let best = 0;
      line.forEach((q, i) => {
        if (Math.hypot(q.lat - p.lat, q.lon - p.lon) < Math.hypot(line[best].lat - p.lat, line[best].lon - p.lon)) best = i;
      });
      return cum[best] / total;
    };
    const at = [...plan.stops, plan.returnPoint].map(nearest);

    const dot = document.createElement("div");
    dot.style.cssText = "width:18px;height:18px;border-radius:999px;background:var(--ink);border:4px solid var(--mark);box-shadow:0 0 0 6px color-mix(in srgb, var(--mark) 35%, transparent);";
    let cancelled = false;
    let raf = 0;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      if (cancelled) return;
      const walker = new maplibre.Marker({ element: dot }).setLngLat([line[0].lon, line[0].lat]).addTo(m);
      const visited = new Set<number>();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t0 = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const f = reduce ? 1 : Math.min(1, (now - t0) / WALK_MS);
        const d = f * total;
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const seg = cum[i] - cum[i - 1] || 1;
        const r = Math.max(0, Math.min(1, (d - cum[i - 1]) / seg));
        walker.setLngLat([line[i - 1].lon + (line[i].lon - line[i - 1].lon) * r, line[i - 1].lat + (line[i].lat - line[i - 1].lat) * r]);
        at.forEach((p, j) => {
          if (f >= p - 0.005 && !visited.has(j) && stopEls.current[j]) {
            visited.add(j);
            visit(stopEls.current[j]);
          }
        });
        if (f < 1) raf = requestAnimationFrame(tick);
        else done.current?.();
      };
      raf = requestAnimationFrame(tick);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      dot.remove();
    };
  }, [walking, plan, ready]);

  return <div ref={box} className={className} role="img" aria-label={`Map of the walk: ${plan.stops.length} stops, finishing at ${plan.returnPoint.name}`} />;
}
