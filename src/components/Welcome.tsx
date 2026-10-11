"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, MapTrifold, PlayCircle, Sneaker } from "@phosphor-icons/react";
import { useDialog } from "@/lib/client/useDialog";
import { Button } from "./ui";

// The story that started it.
const STORY_URL = "https://9gag.com/gag/an7nmYB";

const STEPS = [
  { icon: Sneaker, title: "Pick your time", body: "Tap 30 min, 1 hour or 90 min. Or tap Customise this walk to set your own, like 20 minutes heading toward the harbour." },
  { icon: MapTrifold, title: "Walk the loop", body: "Gemma picks real spots where cans get left, ends at a return machine, and opens it in Google Maps." },
  { icon: Camera, title: "Photo your haul", body: "One photo. Gemma counts, checks for the deposit mark and prints a voucher. Keep the cash or give it away." },
];

export function Welcome({ open, onClose, onSettings, onDemo }: { open: boolean; onClose: () => void; onSettings: () => void; onDemo: () => void }) {
  const reduce = useReducedMotion();
  const ref = useDialog<HTMLDivElement>(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="absolute inset-0 bg-ink/50" aria-label="Close welcome" tabIndex={-1} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[20px] bg-bg px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:rounded-[20px]"
            initial={reduce ? false : { y: 40 }}
            animate={{ y: 0 }}
            exit={reduce ? undefined : { y: 40 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <h2 id="welcome-title" className="sign text-[2.4rem] font-bold uppercase leading-[0.95]">
              A walk that pays
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Someone in Germany{" "}
              <a href={STORY_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-mark decoration-2 underline-offset-4">
                posted on 9GAG
              </a>{" "}
              that they bought a PS5 with over 2,000 deposit bottles at 25 cents each. It took 42 days of 2 to 3 hours a day, and they lost weight doing it.
            </p>
            <p className="mt-2 text-[15px] leading-relaxed">Return Route is that walk, planned for you: the spots where cans get left, then the return machine.</p>

            <ol className="mt-5 flex flex-col gap-4">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mark text-on-mark">
                    <Icon size={18} weight="bold" />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {i + 1}. {title}
                    </span>
                    <span className="text-[14px] leading-relaxed text-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ol>

            <p className="mt-5 rounded-xl bg-surface p-3 text-[13px] leading-relaxed text-muted">
              <span className="font-semibold text-ink">Privacy:</span> Gemma runs on this app&apos;s server, or on your phone if it can handle it, where photos never leave the
              device. The Gemma button at the top shows which, and lets you switch.
            </p>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button autoFocus onClick={onClose}>
                Let&apos;s walk
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  onDemo();
                }}
              >
                <PlayCircle size={18} />
                Watch the demo
              </Button>
            </div>
            <button
              onClick={() => {
                onClose();
                onSettings();
              }}
              className="mt-3 w-full text-center text-[14px] font-medium text-muted underline decoration-line underline-offset-4 hover:text-ink"
            >
              Choose where Gemma runs
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
