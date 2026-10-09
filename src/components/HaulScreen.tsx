"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Camera, HandHeart, Minus, Plus, Warning } from "@phosphor-icons/react";
import { formatMoney, getScheme, type Scheme } from "@/lib/countries";
import { receiptLines, type ReceiptLine } from "@/lib/ai/guard";
import type { HaulChecked } from "@/lib/ai/engine";
import { Button } from "./ui";

export type LoggedHaul = { containers: number; amount: number; donated: boolean };

const TIER_WORDS = { edge: "on this phone, photo never left it", local: "on a laptop", cloud: "in the cloud" } as const;

const NOTE: Record<ReceiptLine["status"], string> = {
  paid: "",
  maybe: "mark not visible",
  damaged: "crushed, machine will refuse",
  no_mark: "no deposit mark",
  not_in_scheme: "not in the scheme",
};

export function HaulScreen({
  country,
  donateDefault,
  check,
  onLog,
}: {
  country: string;
  donateDefault: boolean;
  check: (photo: Blob) => Promise<HaulChecked>;
  onLog: (h: LoggedHaul) => void;
}) {
  const reduce = useReducedMotion();
  const scheme: Scheme = getScheme(country) ?? getScheme("ie")!;
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HaulChecked | null>(null);
  const [adjust, setAdjust] = useState(0);

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo) : undefined), [photo]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPhoto(URL.createObjectURL(file));
    setResult(null);
    setAdjust(0);
    setError(null);
    setBusy(true);
    try {
      setResult(await check(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gemma couldn't read that photo.");
    } finally {
      setBusy(false);
    }
  };

  const lines = useMemo(() => (result ? receiptLines(result.reading.items, scheme) : []), [result, scheme]);
  const t = result?.totals;
  const count = t ? Math.max(0, t.eligible + adjust) : 0;
  // A correction by hand counts at the small-container rate: most litter is cans.
  const total = t ? Math.max(0, Math.round((t.sure + adjust * scheme.small) * 100) / 100) : 0;
  const upTo = t ? Math.max(total, Math.round((t.possible + adjust * scheme.small) * 100) / 100) : 0;
  const money = (n: number) => formatMoney(n, scheme.currency);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="sign text-[3rem] font-bold uppercase leading-[0.95]">Lay it all out</h1>
        <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-muted">
          Labels up, nothing stacked. One photo, and Gemma counts the cans and bottles and checks each one for the {scheme.scheme} mark.
        </p>
      </header>

      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />

      <button
        onClick={() => input.current?.click()}
        className="viewfinder relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[6px] bg-surface p-[3px] transition active:scale-[0.99]"
        aria-label={photo ? "Take another photo" : "Take a photo of your haul"}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Your haul" className="h-full w-full rounded-[3px] object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-3 text-muted">
            <Camera size={44} />
            <span className="font-mono text-[13px] uppercase">Tap to open the camera</span>
          </span>
        )}
        {busy && !reduce && (
          <motion.span
            className="absolute inset-x-3 h-0.5 bg-mark shadow-[0_0_12px_2px_var(--mark)]"
            initial={{ top: "6%" }}
            animate={{ top: ["6%", "94%", "6%"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        {busy && <span className="absolute bottom-3 left-3 bg-post px-2 py-1 font-mono text-[12px] uppercase text-on-post">Gemma is counting</span>}
      </button>

      {error && (
        <p role="alert" className="flex items-start gap-2 text-[14px]">
          <Warning size={18} className="mt-0.5 shrink-0 text-mark-ink" />
          {error}
        </p>
      )}

      {t && result && (
        <motion.section
          aria-label="Your voucher"
          initial={reduce ? false : { clipPath: "inset(0 0 100% 0)" }}
          animate={{ clipPath: "inset(0 0 0% 0)" }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="voucher px-5 py-7 font-mono text-[13px]"
        >
          <p className="text-center uppercase tracking-[0.2em] text-muted">Return Route voucher</p>
          <p className="mt-1 text-center uppercase text-muted">
            {scheme.scheme}, {scheme.country}
          </p>

          <ul className="mt-6 flex flex-col gap-2.5">
            {lines.length === 0 && <li className="text-muted">No drink containers in this photo.</li>}
            {lines.map((l) => {
              const counts = l.status === "paid" || l.status === "maybe";
              return (
                <li key={`${l.status}${l.label}`} className={counts ? "" : "text-muted"}>
                  <div className="flex items-end gap-2">
                    <span className={`uppercase ${counts ? "" : "line-through"}`}>
                      {l.label} ×{l.qty}
                    </span>
                    <span className="leader" />
                    <span className="tabular">{counts ? money(l.amount) : money(0)}</span>
                  </div>
                  {NOTE[l.status] && <span className="text-[12px] text-muted">{NOTE[l.status]}</span>}
                </li>
              );
            })}
            {adjust !== 0 && (
              <li>
                <div className="flex items-end gap-2">
                  <span className="uppercase">Hand count {adjust > 0 ? `+${adjust}` : adjust}</span>
                  <span className="leader" />
                  <span className="tabular">{money(adjust * scheme.small)}</span>
                </div>
              </li>
            )}
          </ul>

          <div className="mt-6 border-t-2 border-dashed border-line pt-4">
            <div className="flex items-end justify-between gap-3">
              <span className="uppercase">Total</span>
              <span className="sign tabular font-sans text-[2.6rem] font-bold leading-none">{money(total)}</span>
            </div>
            {t.maybe > 0 && upTo > total && <p className="mt-2 text-right text-muted">up to {money(upTo)} if the unsure ones have the mark</p>}
          </div>

          {result.reading.notes && lines.length > 0 && <p className="mt-5 normal-case leading-relaxed text-muted">{result.reading.notes}</p>}
          <p className="mt-5 text-center text-[11px] uppercase text-muted">
            Read by {result.model} {TIER_WORDS[result.tier]}
            {result.gemmaMs ? `, ${(result.gemmaMs / 1000).toFixed(1)}s` : ""}
          </p>
        </motion.section>
      )}

      {t && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[15px]">Count&apos;s off?</span>
            <span className="inline-flex items-center gap-1 rounded-xl border border-line p-1">
              <button onClick={() => setAdjust((a) => Math.max(-t.eligible, a - 1))} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-surface" aria-label="One fewer">
                <Minus size={16} weight="bold" />
              </button>
              <span className="tabular w-8 text-center font-mono font-semibold">{count}</span>
              <button onClick={() => setAdjust((a) => a + 1)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-surface" aria-label="One more">
                <Plus size={16} weight="bold" />
              </button>
            </span>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-2">
            <Button onClick={() => onLog({ containers: count, amount: total, donated: false })} className="min-h-14 text-base">
              Keep {money(total)}
            </Button>
            <Button variant={donateDefault ? "post" : "outline"} onClick={() => onLog({ containers: count, amount: total, donated: true })} className="min-h-14">
              <HandHeart size={18} />
              Donate it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
