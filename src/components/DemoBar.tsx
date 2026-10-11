"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowCounterClockwise, X } from "@phosphor-icons/react";
import { DEMO_STEPS } from "@/lib/demo";

/** The guided demo's caption card: what's happening, and one button to move on. */
export function DemoBar({
  step,
  next,
  onNext,
  onExit,
  onReplay,
  note,
}: {
  step: number;
  /** The Next button's label, or null while the app is busy with this step. */
  next: string | null;
  onNext: () => void;
  onExit: () => void;
  onReplay: () => void;
  note?: string | null;
}) {
  const reduce = useReducedMotion();
  const s = DEMO_STEPS[step];
  const last = step === DEMO_STEPS.length - 1;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="region" aria-label="Guided demo">
      <div className="mx-auto max-w-xl rounded-[20px] bg-post p-4 text-on-post shadow-[0_12px_40px_-12px_rgb(0_0_0/0.5)]">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-wide opacity-70">
            Demo · {step + 1} of {DEMO_STEPS.length}
          </span>
          <button onClick={onExit} className="-mr-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[13px] opacity-80 hover:opacity-100">
            <X size={14} />
            Exit demo
          </button>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {DEMO_STEPS.map((d, i) => (
            <span key={d.id} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-mark" : "bg-on-post/20"}`} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={s.id}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            aria-live="polite"
          >
            <p className="mt-3 text-[17px] font-semibold leading-snug">{s.title}</p>
            <p className="mt-1 text-[14px] leading-relaxed opacity-80">{s.body}</p>
            {note && <p className="mt-2 font-mono text-[11px] uppercase text-mark">{note}</p>}
          </motion.div>
        </AnimatePresence>
        <div className="mt-3 flex gap-2">
          {last ? (
            <>
              <button onClick={onReplay} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-on-post/25 text-[15px] font-semibold">
                <ArrowCounterClockwise size={17} />
                Replay
              </button>
              <button onClick={onExit} className="inline-flex min-h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-mark text-[15px] font-semibold text-on-mark">
                Plan your own walk
                <ArrowRight size={17} weight="bold" />
              </button>
            </>
          ) : (
            <button
              onClick={onNext}
              disabled={next === null}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-mark text-[15px] font-semibold text-on-mark transition disabled:opacity-60"
            >
              {next ?? "Working…"}
              {next !== null && <ArrowRight size={17} weight="bold" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
