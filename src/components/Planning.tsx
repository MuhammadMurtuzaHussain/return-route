"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Tier } from "@/lib/ai/schema";

const WHERE: Record<Tier, string> = { edge: "on this phone", local: "on the laptop", cloud: "in the cloud" };

/** Loading state shaped like the route it is about to show. */
export function Planning({ tier }: { tier: Tier }) {
  const reduce = useReducedMotion();
  const steps = ["Reading the map around you", "Checking yesterday's weather", `Asking Gemma ${WHERE[tier]} to pick the stops`, "Drawing the route"];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), tier === "edge" ? 4000 : 2200);
    return () => clearInterval(t);
  }, [steps.length, tier]);

  const pulse = reduce ? {} : { animate: { opacity: [0.55, 1, 0.55] }, transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" as const } };

  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <motion.div {...pulse} className="-mx-4 h-[42dvh] min-h-64 bg-sunk sm:mx-0 sm:rounded-[20px]" />
      <div className="flex flex-col gap-2">
        <motion.div {...pulse} className="h-8 w-3/4 rounded-full bg-sunk" />
        <motion.div {...pulse} className="h-4 w-1/2 rounded-full bg-sunk" />
      </div>
      <p className="text-[15px] text-muted">{steps[step]}…</p>
    </div>
  );
}
