"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { HandHeart, NotePencil, Warning } from "@phosphor-icons/react";
import { budgetM, stopsFor } from "@/lib/plan/select";
import { DEMO_START } from "@/lib/demo";
import type { Goal, Mode, Totals } from "@/lib/client/store";
import { VoucherStub } from "./Voucher";

export type Where = { kind: "here"; lat: number; lon: number } | { kind: "demo"; lat: number; lon: number; name: string };

export { DEMO_START };

// Fingerpost blades, shortest to longest, like a real signpost.
const BLADES = [
  { minutes: 30, label: "30 min", width: "74%" },
  { minutes: 60, label: "1 hour", width: "88%" },
  { minutes: 90, label: "90 min", width: "100%" },
];

const TIMES = [20, 45, 75, 120];

const km = (minutes: number) => (budgetM(minutes, stopsFor(minutes)) / 1000).toFixed(1);

export type GoPreset = { intent: string; minutes: number; demoStart: boolean };

export function GoScreen({
  onPlan,
  totals,
  goal,
  rate,
  error,
  flash,
  mode,
  setMode,
  cause,
  setCause,
  preset,
}: {
  onPlan: (p: { minutes: number; intent: string; donate: boolean; where: Where }) => void;
  totals: Totals;
  goal: Goal;
  /** The scheme's usual deposit, for the "cans to go" maths. */
  rate: number;
  error: string | null;
  flash: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  cause: string;
  setCause: (c: string) => void;
  /** The guided demo fills these in. */
  preset?: GoPreset;
}) {
  const reduce = useReducedMotion();
  const [intent, setIntent] = useState(preset?.intent ?? "");
  const [noteOpen, setNoteOpen] = useState(!!preset?.intent);
  // Only the guided demo starts at Terryland; everyone else starts where they are.
  const demo = preset?.demoStart ?? false;
  const [locating, setLocating] = useState<number | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [custom, setCustom] = useState(20);
  const [other, setOther] = useState("");
  const forCause = mode === "cause";
  const donate = forCause;

  const go = (minutes: number) => {
    setLocError(null);
    if (demo) return onPlan({ minutes, intent, donate, where: DEMO_START });
    if (!("geolocation" in navigator)) {
      setLocError("This browser can't share your location. Watch the demo below to see a walk from Terryland Forest Park.");
      return;
    }
    setLocating(minutes);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(null);
        onPlan({ minutes, intent, donate, where: { kind: "here", lat: pos.coords.latitude, lon: pos.coords.longitude } });
      },
      () => {
        setLocating(null);
        setLocError("Couldn't get your location. Allow it in the browser, or watch the demo below to see a walk from Terryland Forest Park.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const message = error ?? locError;
  const otherMinutes = Math.round(Number(other));
  const otherOk = other !== "" && otherMinutes >= 15 && otherMinutes <= 180;
  const chosen = other !== "" ? otherMinutes : custom;
  const chosenOk = other !== "" ? otherOk : true;
  const causeName = cause.trim();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="sign text-[3.4rem] font-bold uppercase leading-[0.92]">
        Out for
        <span className="block text-muted">{forCause ? (causeName ? `${causeName}.` : "a walk for good.") : "a walk that pays."}</span>
      </h1>

      <nav aria-label="How long have you got?" className="relative flex flex-col gap-3 pl-5">
        <span className="absolute bottom-[-24px] left-0 top-[-12px] w-3 rounded-t-[3px] bg-post" aria-hidden="true" />
        {BLADES.map((b, i) => (
          <motion.button
            key={b.minutes}
            onClick={() => go(b.minutes)}
            disabled={locating !== null}
            style={{ width: b.width }}
            initial={reduce ? false : { x: -24, opacity: 0 }}
            animate={{ x: locating === b.minutes && !reduce ? 10 : 0, opacity: locating !== null && locating !== b.minutes ? 0.35 : 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 26, delay: reduce ? 0 : 0.06 * i }}
            whileTap={reduce ? undefined : { x: 6 }}
            className={`blade group flex min-h-[76px] items-center justify-between gap-3 bg-mark pl-5 pr-12 text-left text-on-mark transition-[filter] hover:brightness-105 focus-visible:outline-offset-4 ${
              preset?.minutes === b.minutes ? "nudge" : ""
            }`}
          >
            <span className="sign text-[2.6rem] font-bold uppercase leading-none">{b.label}</span>
            <span className="tabular font-mono text-[12px] font-medium uppercase opacity-70">
              {locating === b.minutes ? "Finding you…" : `≈${km(b.minutes)} km`}
            </span>
          </motion.button>
        ))}
      </nav>

      <div className="flex flex-col gap-4 pt-3">
        <div role="group" aria-label="What is this walk for?" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 text-[14px] font-semibold">
          {(
            [
              ["earn", "Earn it"],
              ["cause", "Walk for a cause"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg transition ${mode === m ? "bg-mark text-on-mark" : "text-muted hover:text-ink"}`}
            >
              {m === "cause" && <HandHeart size={16} weight={mode === m ? "fill" : "regular"} />}
              {label}
            </button>
          ))}
        </div>

        {forCause && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface p-4">
            <label htmlFor="cause" className="text-[14px] font-medium">
              Who is this walk for?
            </label>
            <input
              id="cause"
              maxLength={60}
              value={cause}
              onChange={(e) => setCause(e.target.value)}
              placeholder="Local food bank, Pieta House"
              className="min-h-12 rounded-xl border border-line bg-bg px-4 text-[15px] placeholder:text-muted focus:border-mark focus:outline-none"
            />
            <span className="text-[13px] leading-relaxed text-muted">
              At the machine, press its charity button instead of printing a voucher. Return Route counts it as given and writes you a post to rally others.
            </span>
          </div>
        )}

        {!noteOpen && (
          <button
            onClick={() => setNoteOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 self-start rounded-xl px-3 text-[14px] font-medium text-muted hover:text-ink"
          >
            <NotePencil size={16} />
            Customise this walk: your own time or direction
          </button>
        )}

        {noteOpen && (
          <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <label htmlFor="intent" className="text-[14px] font-medium">
              Tell Gemma where to head or what to avoid
            </label>
            <input
              id="intent"
              autoFocus={!preset}
              maxLength={300}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Head toward the harbour, stay off the main road"
              className="min-h-12 rounded-xl border border-line bg-surface px-4 text-[15px] placeholder:text-muted focus:border-mark focus:outline-none"
            />

            <span id="time-label" className="mt-3 text-[14px] font-medium">
              How long?
            </span>
            <div role="group" aria-labelledby="time-label" className="flex flex-wrap gap-2">
              {TIMES.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setCustom(t);
                    setOther("");
                  }}
                  aria-pressed={other === "" && custom === t}
                  className={`min-h-10 rounded-xl border px-3 font-mono text-[13px] transition ${
                    other === "" && custom === t ? "border-mark bg-mark/15 text-ink" : "border-line text-muted hover:text-ink"
                  }`}
                >
                  {t < 60 ? `${t} min` : t === 120 ? "2 hours" : `${t} min`}
                </button>
              ))}
              <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 font-mono text-[13px] text-muted focus-within:border-mark">
                Other
                <input
                  type="number"
                  inputMode="numeric"
                  min={15}
                  max={180}
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  aria-label="Other length in minutes, 15 to 180"
                  placeholder="mins"
                  className="tabular w-14 bg-transparent text-ink placeholder:text-muted/70 focus:outline-none"
                />
              </label>
            </div>
            {other !== "" && !otherOk && <span className="text-[13px] text-mark-ink">Pick between 15 and 180 minutes.</span>}

            <button
              onClick={() => go(chosen)}
              disabled={!chosenOk || locating !== null}
              className="mt-2 min-h-12 rounded-xl bg-mark px-4 text-[15px] font-semibold text-on-mark transition hover:brightness-105 disabled:opacity-45"
            >
              {locating === chosen ? "Finding you…" : `Plan a ${chosenOk ? chosen : "…"}-minute walk`}
            </button>
            <span className="text-[13px] text-muted">The signs above use this note too.</span>
          </div>
        )}
        {message && (
          <p role="alert" className="flex items-start gap-2 text-[14px]">
            <Warning size={18} className="mt-0.5 shrink-0 text-mark-ink" />
            {message}
          </p>
        )}
      </div>

      <VoucherStub totals={totals} goal={goal} flash={flash} rate={rate} cause={forCause ? causeName : null} />
    </div>
  );
}
