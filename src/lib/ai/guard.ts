import { depositFor, type Scheme } from "../countries";
import { fits } from "../plan/select";
import type { Hotspot, LatLng, ReturnPoint } from "../plan/types";
import type { HaulItem, PlanPick } from "./schema";

// Gemma suggests; this file decides. The prompt asks Gemma to behave, but
// these rules are where behaving is enforced:
//   1. every stop and the return point must be one we offered, or it is dropped;
//   2. the route must still fit the time the person has, or we use the default;
//   3. money is computed from the deposit table, never taken from the model.

export type GuardedPlan = {
  stopIds: string[];
  returnPointId: string;
  why: Record<string, string>;
  title: string;
  lookFor: string;
  tip: string;
  /** What the guard had to do. Shown in the eval, not to the walker. */
  flags: string[];
};

export function guardPlan(
  pick: PlanPick | null,
  ctx: {
    start: LatLng;
    minutes: number;
    hotspots: Hotspot[];
    returnPoints: ReturnPoint[];
    fallback: { stopIds: string[]; returnPointId: string };
    defaultTitle: string;
  },
): GuardedPlan {
  const flags: string[] = [];
  const byId = new Map(ctx.hotspots.map((h) => [h.id, h]));
  const rpById = new Map(ctx.returnPoints.map((r) => [r.id, r]));
  const why: Record<string, string> = {};

  if (!pick) {
    flags.push("no_model_output");
    return { ...ctx.fallback, why, title: ctx.defaultTitle, lookFor: "", tip: "", flags };
  }

  const seen = new Set<string>();
  const stops: Hotspot[] = [];
  for (const s of pick.stops) {
    const h = byId.get(s.id.trim());
    if (!h) {
      flags.push(`invented_stop:${s.id}`);
      continue;
    }
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    stops.push(h);
    why[h.id] = clean(s.why, 160);
  }

  let rp = rpById.get(pick.returnPointId.trim());
  if (!rp) {
    flags.push(`invented_return_point:${pick.returnPointId}`);
    rp = rpById.get(ctx.fallback.returnPointId);
  }

  let stopIds = stops.map((s) => s.id);
  let returnPointId = rp?.id ?? ctx.fallback.returnPointId;
  if (!stops.length && ctx.fallback.stopIds.length) {
    flags.push("no_valid_stops");
    stopIds = ctx.fallback.stopIds;
  } else if (rp && !fits(ctx.minutes, ctx.start, stops, rp, 1.35)) {
    // Too long for the time. Keep the walker's finish (they may have asked for
    // it) and drop stops from the end until it fits; only then give up on it.
    flags.push("too_long");
    const kept = [...stops];
    while (kept.length > 1 && !fits(ctx.minutes, ctx.start, kept, rp, 1.35)) kept.pop();
    if (fits(ctx.minutes, ctx.start, kept, rp, 1.35)) {
      stopIds = kept.map((s) => s.id);
    } else {
      stopIds = ctx.fallback.stopIds;
      returnPointId = ctx.fallback.returnPointId;
    }
  }

  return {
    stopIds,
    returnPointId,
    why,
    title: stripMoney(clean(pick.title, 60)) || ctx.defaultTitle,
    lookFor: stripMoney(clean(pick.lookFor, 200)),
    tip: stripMoney(clean(pick.tip, 160)),
    flags,
  };
}

/** Gemma's words are read aloud; they must not promise money the app did not compute. */
export function stripMoney(s: string): string {
  return s
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/[€£$]\s?\d|\d+\s?(euro|eur|cent|kr|zł|ft)\b/i.test(sentence))
    .join(" ")
    .trim();
}

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export type HaulTotals = {
  counted: number;
  eligible: number;
  /** Eligible, but the mark could not be seen. */
  maybe: number;
  rejected: { damaged: number; noMark: number; notInScheme: number };
  sure: number;
  possible: number;
  currency: string;
};

/** Payout from the deposit table. Gemma only describes what it sees. */
export function haulTotals(items: HaulItem[], scheme: Scheme): HaulTotals {
  const t: HaulTotals = { counted: 0, eligible: 0, maybe: 0, rejected: { damaged: 0, noMark: 0, notInScheme: 0 }, sure: 0, possible: 0, currency: scheme.currency };
  for (const it of items.slice(0, 120)) {
    if (it.material === "other") continue;
    t.counted++;
    const ml = Number.isFinite(it.ml) ? Math.min(Math.max(it.ml, 0), 20_000) : 500;
    const value = depositFor(scheme, it.material, ml);
    if (value === 0) {
      t.rejected.notInScheme++;
      continue;
    }
    if (it.damaged) {
      t.rejected.damaged++;
      continue;
    }
    if (it.mark === "no") {
      t.rejected.noMark++;
      continue;
    }
    if (it.mark === "unsure") {
      t.maybe++;
      t.possible += value;
      continue;
    }
    t.eligible++;
    t.sure += value;
    t.possible += value;
  }
  t.sure = Math.round(t.sure * 100) / 100;
  t.possible = Math.round(t.possible * 100) / 100;
  return t;
}

/**
 * Small models wrap JSON in prose or code fences, or trail off mid-object.
 * Pull out the first complete JSON object we can parse.
 */
export function extractJson(text: string): unknown {
  const s = text.replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(s.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
