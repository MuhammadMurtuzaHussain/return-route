"use client";

import { useSyncExternalStore } from "react";

// Light, dark, or follow the system. Stored as a plain string because the
// inline script in layout.tsx reads it before the page paints.

export type Theme = "system" | "light" | "dark";

const KEY = "return-route.theme";
const EVENT = "return-route:theme";

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function setTheme(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // Private mode: the choice still applies until reload.
  }
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  window.dispatchEvent(new Event(EVENT));
}

/** Is the page dark right now, whether chosen or from the system? */
export function isDark(): boolean {
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(EVENT, onChange);
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    mq.removeEventListener("change", onChange);
  };
}

/** The chosen theme. */
export const useTheme = () => useSyncExternalStore(subscribe, read, () => "system" as Theme);

/** Whether the page is showing dark, so maps and canvases can redraw to match. */
export const useDark = () => useSyncExternalStore(subscribe, isDark, () => false);
