"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, X } from "@phosphor-icons/react";
import type { Tier } from "@/lib/ai/schema";

const WHERE: Record<Tier, string> = { edge: "on this phone", local: "on the laptop", cloud: "in the cloud" };

/** Loading state shaped like the route it is about to show, with honest steps. */
export function Planning({ tier, minutes, forCause, onCancel }: { tier: Tier; minutes: number; forCause?: boolean; onCancel?: () => void }) {
  const reduce = useReducedMotion();
  const steps = [
    "Reading the map around you",
    "Checking yesterday's weather",
    forCause ? `Gemma ${WHERE[tier]} is finding where you're needed` : `Gemma ${WHERE[tier]} is picking stops`,
    "Drawing the route",
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), tier === "edge" ? 4000 : 2200);
    return () => clearInterval(t);
  }, [steps.length, tier]);

  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <div className="relative -mx-4 h-[46dvh] min-h-64 overflow-hidden bg-sunk">
        <motion.span
          className="absolute left-0 top-1/2 h-1.5 w-full origin-left bg-mark"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: reduce ? 0.6 : [0, 0.85] }}
          transition={{ duration: reduce ? 0 : 6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div>
        <div className="flex items-start justify-between gap-3">
          <p className="sign text-[2.4rem] font-bold uppercase leading-none">{minutes === 60 ? "One hour" : `${minutes} minutes`}</p>
          {onCancel && (
            <button onClick={onCancel} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-[14px] font-medium text-muted hover:text-ink">
              <X size={16} />
              Cancel
            </button>
          )}
        </div>
        <ol className="mt-5 flex flex-col gap-3 font-mono text-[13px] uppercase">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-3 transition ${i > step ? "text-muted/50" : i === step ? "text-ink" : "text-muted"}`}>
              <span className="grid h-5 w-5 place-items-center">
                {i < step ? <Check size={14} weight="bold" /> : i === step ? <span className="h-2 w-2 animate-pulse bg-mark" /> : <span className="h-1 w-1 bg-line" />}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
