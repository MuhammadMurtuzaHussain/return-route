"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { NotePencil, Warning } from "@phosphor-icons/react";
import { budgetM, stopsFor } from "@/lib/plan/select";
import type { Goal, Totals } from "@/lib/client/store";
import { Chip } from "./ui";
import { VoucherStub } from "./Voucher";

export type Where = { kind: "here"; lat: number; lon: number } | { kind: "demo"; lat: number; lon: number; name: string };

export const DEMO_START = { kind: "demo" as const, lat: 53.2845, lon: -9.042, name: "Terryland Forest Park, Galway" };

// Fingerpost blades, shortest to longest, like a real signpost.
const BLADES = [
  { minutes: 30, label: "30 min", width: "74%" },
  { minutes: 60, label: "1 hour", width: "88%" },
  { minutes: 90, label: "90 min", width: "100%" },
];

const km = (minutes: number) => (budgetM(minutes, stopsFor(minutes)) / 1000).toFixed(1);

export function GoScreen({
  onPlan,
  totals,
  goal,
  donateDefault,
  error,
  flash,
}: {
  onPlan: (p: { minutes: number; intent: string; donate: boolean; where: Where }) => void;
  totals: Totals;
  goal: Goal;
  donateDefault: boolean;
  error: string | null;
  flash: boolean;
}) {
  const reduce = useReducedMotion();
  const [intent, setIntent] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [donate, setDonate] = useState(donateDefault);
  const [demo, setDemo] = useState(false);
  const [locating, setLocating] = useState<number | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  const go = (minutes: number) => {
    setLocError(null);
    if (demo) return onPlan({ minutes, intent, donate, where: DEMO_START });
    if (!("geolocation" in navigator)) {
      setLocError("This browser can't share your location. Try the Terryland demo start instead.");
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
        setLocError("Couldn't get your location. Allow it in the browser, or start from the Terryland demo.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const message = error ?? locError;

  return (
    <div className="flex flex-col gap-9">
      <h1 className="sign text-[3.4rem] font-bold uppercase leading-[0.92]">
        Out for
        <span className="block text-muted">a walk that pays.</span>
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
            className="blade group flex min-h-[76px] items-center justify-between gap-3 bg-mark pl-5 pr-12 text-left text-on-mark transition-[filter] hover:brightness-105 focus-visible:outline-offset-4"
          >
            <span className="sign text-[2.6rem] font-bold uppercase leading-none">{b.label}</span>
            <span className="tabular font-mono text-[12px] font-medium uppercase opacity-70">
              {locating === b.minutes ? "Finding you…" : `≈${km(b.minutes)} km`}
            </span>
          </motion.button>
        ))}
      </nav>

      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip checked={donate} onChange={setDonate}>
            Donate the refund
          </Chip>
          <Chip checked={demo} onChange={setDemo}>
            Start at Terryland (demo)
          </Chip>
          {!noteOpen && (
            <button
              onClick={() => setNoteOpen(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-[14px] font-medium text-muted hover:text-ink"
            >
              <NotePencil size={16} />
              Add a note
            </button>
          )}
        </div>
        {noteOpen && (
          <div className="flex flex-col gap-2">
            <label htmlFor="intent" className="text-[14px] font-medium">
              Tell Gemma anything
            </label>
            <input
              id="intent"
              autoFocus
              maxLength={300}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Finish at Tesco, stay off the main road"
              className="min-h-12 rounded-xl border border-line bg-surface px-4 text-[15px] placeholder:text-muted focus:border-mark focus:outline-none"
            />
            <span className="text-[13px] text-muted">Then tap a sign.</span>
          </div>
        )}
        {message && (
          <p role="alert" className="flex items-start gap-2 text-[14px]">
            <Warning size={18} className="mt-0.5 shrink-0 text-mark-ink" />
            {message}
          </p>
        )}
      </div>

      <VoucherStub totals={totals} goal={goal} flash={flash} />
    </div>
  );
}
