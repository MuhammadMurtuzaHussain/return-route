"use client";

import { useCallback, useEffect, useState } from "react";

// Everything Return Route remembers lives on this device, in localStorage:
// your totals, your goal, and how each hotspot actually paid out for you.

export type Totals = { earned: number; donated: number; containers: number; walks: number; currency: string };
export type Goal = { label: string; amount: number };
export type Mode = "earn" | "cause";
export type Settings = { engine: "server" | "edge"; country: string | null; mode: Mode; cause: string };

export const DEFAULT_TOTALS: Totals = { earned: 0, donated: 0, containers: 0, walks: 0, currency: "EUR" };
export const DEFAULT_GOAL: Goal = { label: "A PS5", amount: 500 };
export const DEFAULT_SETTINGS: Settings = { engine: "server", country: null, mode: "earn", cause: "" };

const KEY = "return-route";

function read<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${KEY}.${name}`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(name: string, value: T) {
  try {
    localStorage.setItem(`${KEY}.${name}`, JSON.stringify(value));
  } catch {
    // Private mode or storage full: the app still works, it just forgets.
  }
}

/** useState that survives a reload. Starts from the fallback so server and client render the same. */
export function useStored<T extends object>(name: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount on purpose
    setValue(read(name, fallback));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        write(name, v);
        return v;
      });
    },
    [name],
  );
  return [value, update, hydrated] as const;
}

/**
 * Learn from a haul. We only know the total, not which stop gave what, so each
 * visited hotspot moves part of the way towards actual ÷ expected.
 */
export function learn(history: Record<string, number>, stopIds: string[], expected: number, actual: number): Record<string, number> {
  if (!stopIds.length || expected <= 0) return history;
  const ratio = Math.max(0.25, Math.min(4, (actual + 0.5) / (expected + 0.5)));
  const next = { ...history };
  for (const id of stopIds) {
    const old = next[id] ?? 1;
    next[id] = Math.round(Math.max(0.3, Math.min(3, old * Math.sqrt(ratio))) * 100) / 100;
  }
  return next;
}
