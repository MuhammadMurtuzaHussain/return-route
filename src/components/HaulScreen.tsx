"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Camera, HandHeart, Images, Minus, Plus, Warning } from "@phosphor-icons/react";
import { formatMoney, getScheme, type Scheme } from "@/lib/countries";
import { cleanNotes, haulTotals, receiptLines, type ReceiptLine } from "@/lib/ai/guard";
import type { HaulChecked } from "@/lib/ai/engine";
import type { HaulReading } from "@/lib/ai/schema";
import { Button } from "./ui";

export type VoucherLine = { label: string; amount: string; struck: boolean };
export type LoggedHaul = { containers: number; amount: number; donated: boolean; lines: VoucherLine[]; scheme: string; currency: string };

const TIER_WORDS = { edge: "on this phone, photo never left it", local: "on a laptop", cloud: "in the cloud" } as const;

const NOTE: Record<ReceiptLine["status"], string> = {
  paid: "",
  maybe: "mark not visible",
  damaged: "crushed, machine will refuse",
  no_mark: "no deposit mark",
  not_in_scheme: "not in the scheme",
};

type Source = "gemma" | "hand" | "known";

export function HaulScreen({
  country,
  donateDefault,
  cause,
  check,
  onLog,
  sample,
  auto,
  known,
  onRead,
  giveSignal = 0,
}: {
  country: string;
  donateDefault: boolean;
  /** Set in cause mode: giving is the main action. */
  cause?: string | null;
  check: (photo: Blob) => Promise<HaulChecked>;
  onLog: (h: LoggedHaul) => void;
  /** Loads the sample haul photo, for people with no cans to hand. */
  sample: () => Promise<Blob>;
  /** The guided demo: read this sample straight away. */
  auto?: boolean;
  /** The guided demo: the sample's reading, already checked against a real voucher, and where it came from. */
  known?: { reading: HaulReading; source: string };
  onRead?: () => void;
  /** The guided demo: bump this to give the refund away. */
  giveSignal?: number;
}) {
  const reduce = useReducedMotion();
  const scheme: Scheme = getScheme(country) ?? getScheme("ie")!;
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HaulChecked | null>(null);
  const [source, setSource] = useState<Source>("gemma");
  const [adjust, setAdjust] = useState(0);
  const giving = cause !== undefined && cause !== null;

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo) : undefined), [photo]);

  const read = useCallback(
    async (file: Blob, checked?: HaulReading) => {
      setPhoto(URL.createObjectURL(file));
      setResult(null);
      setAdjust(0);
      setError(null);
      // The demo's real haul was checked against the machine's voucher, so it is shown as checked.
      if (checked) {
        setResult({ reading: checked, totals: haulTotals(checked.items, scheme), tier: "cloud", model: "", gemmaMs: 0 });
        setSource("known");
        onRead?.();
        return;
      }
      setBusy(true);
      try {
        setResult(await check(file));
        setSource("gemma");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gemma couldn't read that photo.");
      } finally {
        setBusy(false);
        onRead?.();
      }
    },
    [check, scheme, onRead],
  );

  const trySample = useCallback(async () => {
    setError(null);
    try {
      await read(await sample(), known?.reading);
    } catch {
      setError("Couldn't load the sample photo.");
    }
  }, [read, sample, known]);

  const started = useRef(false);
  useEffect(() => {
    if (auto && !started.current) {
      started.current = true;
      void trySample();
    }
  }, [auto, trySample]);

  const byHand = () => {
    setPhoto(null);
    setError(null);
    setAdjust(0);
    setResult({ reading: { items: [], notes: "" }, totals: haulTotals([], scheme), tier: "local", model: "", gemmaMs: 0 });
    setSource("hand");
  };

  const lines = useMemo(() => (result ? receiptLines(result.reading.items, scheme) : []), [result, scheme]);
  const t = result?.totals;
  const count = t ? Math.max(0, t.eligible + adjust) : 0;
  // A correction by hand counts at the small-container rate: most litter is cans.
  const total = t ? Math.max(0, Math.round((t.sure + adjust * scheme.small) * 100) / 100) : 0;
  const upTo = t ? Math.max(total, Math.round((t.possible + adjust * scheme.small) * 100) / 100) : 0;
  const money = (n: number) => formatMoney(n, scheme.currency);
  const notes = result ? cleanNotes(result.reading.notes) : "";

  const log = (donated: boolean) => {
    const voucher: VoucherLine[] = lines.map((l) => ({
      label: `${l.label} ×${l.qty}`,
      amount: money(l.status === "paid" || l.status === "maybe" ? l.amount : 0),
      struck: !(l.status === "paid" || l.status === "maybe"),
    }));
    if (adjust !== 0) voucher.push({ label: `Hand count ${adjust > 0 ? `+${adjust}` : adjust}`, amount: money(adjust * scheme.small), struck: false });
    onLog({ containers: count, amount: total, donated, lines: voucher, scheme: `${scheme.scheme}, ${scheme.country}`, currency: scheme.currency });
  };

  // In the demo the caption card covers the bottom of the screen, so bring the voucher up.
  const voucher = useRef<HTMLElement>(null);
  useEffect(() => {
    if (auto && result) setTimeout(() => voucher.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 700);
  }, [auto, result, reduce]);

  const gave = useRef(0);
  useEffect(() => {
    if (giveSignal > gave.current && result) {
      gave.current = giveSignal;
      log(true);
    }
  });

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="sign text-[3rem] font-bold uppercase leading-[0.95]">Lay it all out</h1>
        <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-muted">
          Labels up, nothing stacked. One photo, and Gemma counts the cans and bottles and checks each one for the {scheme.scheme} mark.
        </p>
      </header>

      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      <input ref={gallery} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />

      <button
        onClick={() => camera.current?.click()}
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

      {!result && !busy && (
        <div className="-mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-medium">
          <button onClick={() => gallery.current?.click()} className="inline-flex min-h-10 items-center gap-1.5 text-muted hover:text-ink">
            <Images size={17} />
            Choose from gallery
          </button>
          <button onClick={trySample} className="inline-flex min-h-10 items-center text-muted underline decoration-line underline-offset-4 hover:text-ink">
            No cans handy? Try a sample photo
          </button>
          <button onClick={byHand} className="inline-flex min-h-10 items-center text-muted underline decoration-line underline-offset-4 hover:text-ink">
            Count by hand
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-2 text-[14px]">
          <p className="flex items-start gap-2">
            <Warning size={18} className="mt-0.5 shrink-0 text-mark-ink" />
            {error}
          </p>
          <button onClick={byHand} className="self-start font-medium underline decoration-mark underline-offset-4">
            Count by hand instead
          </button>
        </div>
      )}

      {t && result && (
        <motion.section
          ref={voucher}
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
            {lines.length === 0 && adjust === 0 && (
              <li className="text-muted">{source === "hand" ? "Count your cans and bottles with the + button." : "No drink containers in this photo."}</li>
            )}
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

          {notes && lines.length > 0 && <p className="mt-5 normal-case leading-relaxed text-muted">{notes}</p>}
          {source !== "hand" && (
            <p className="mt-5 text-center text-[11px] uppercase text-muted">
              {source === "known" ? known?.source : `Read by ${result.model} ${TIER_WORDS[result.tier]}`}
              {source === "gemma" && result.gemmaMs ? `, ${(result.gemmaMs / 1000).toFixed(1)}s` : ""}
            </p>
          )}
        </motion.section>
      )}

      {t && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[15px]">{source === "hand" ? "How many?" : "Count's off?"}</span>
            <span className="inline-flex items-center gap-1 rounded-xl border border-line p-1">
              <button onClick={() => setAdjust((a) => Math.max(-t.eligible, a - 1))} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-surface" aria-label="One fewer">
                <Minus size={16} weight="bold" />
              </button>
              <span className="tabular w-8 text-center font-mono font-semibold" aria-live="polite">
                {count}
              </span>
              <button onClick={() => setAdjust((a) => a + 1)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-surface" aria-label="One more">
                <Plus size={16} weight="bold" />
              </button>
            </span>
          </div>
          {count === 0 ? (
            <Button variant="outline" onClick={() => log(false)} className="min-h-14">
              Log the walk anyway
            </Button>
          ) : giving || donateDefault ? (
            <>
              <Button onClick={() => log(true)} className="min-h-14 text-base">
                <HandHeart size={20} weight="fill" />
                Give {money(total)}
                {cause ? ` to ${cause}` : " to charity"}
              </Button>
              <button onClick={() => log(false)} className="self-center text-[14px] font-medium text-muted underline decoration-line underline-offset-4 hover:text-ink">
                Keep it this time
              </button>
            </>
          ) : (
            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <Button onClick={() => log(false)} className="min-h-14 text-base">
                Keep {money(total)}
              </Button>
              <Button variant="outline" onClick={() => log(true)} className="min-h-14">
                <HandHeart size={18} />
                Donate it
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
