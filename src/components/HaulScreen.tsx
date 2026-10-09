"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, HandHeart, Minus, Plus, Warning } from "@phosphor-icons/react";
import { formatMoney, getScheme, type Scheme } from "@/lib/countries";
import type { HaulChecked } from "@/lib/ai/engine";
import { Button, Switch } from "./ui";

export type LoggedHaul = { containers: number; amount: number; donated: boolean };

export function HaulScreen({
  country,
  donateDefault,
  check,
  onLog,
  onCancel,
}: {
  country: string;
  donateDefault: boolean;
  check: (photo: Blob) => Promise<HaulChecked>;
  onLog: (h: LoggedHaul) => void;
  onCancel: () => void;
}) {
  const scheme: Scheme = getScheme(country) ?? getScheme("ie")!;
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HaulChecked | null>(null);
  const [adjust, setAdjust] = useState(0);
  const [donate, setDonate] = useState(donateDefault);

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

  const t = result?.totals;
  const count = t ? Math.max(0, t.eligible + adjust) : 0;
  // A correction by hand counts at the small-container rate: most litter is cans.
  const sure = t ? Math.max(0, Math.round((t.sure + adjust * scheme.small) * 100) / 100) : 0;
  const upTo = t ? Math.max(sure, Math.round((t.possible + adjust * scheme.small) * 100) / 100) : 0;

  const rejected = useMemo(() => {
    if (!t) return [];
    const r: string[] = [];
    if (t.rejected.damaged) r.push(`${t.rejected.damaged} crushed or damaged: the machine will likely refuse ${t.rejected.damaged === 1 ? "it" : "them"}`);
    if (t.rejected.noMark) r.push(`${t.rejected.noMark} without the ${scheme.scheme} mark`);
    if (t.rejected.notInScheme) r.push(`${t.rejected.notInScheme} not in the ${scheme.country} scheme (glass, dairy or the wrong size)`);
    return r;
  }, [t, scheme]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[2.2rem] font-semibold leading-tight tracking-tight">What did you find?</h1>
        <p className="text-muted">Spread the cans and bottles out, labels up, and take one photo. Gemma counts them and checks for the {scheme.scheme} mark.</p>
      </header>

      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />

      {photo ? (
        <button onClick={() => input.current?.click()} className="relative overflow-hidden rounded-[20px] bg-sunk" aria-label="Take another photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="Your haul" className={`max-h-[40dvh] w-full object-cover transition ${busy ? "opacity-60" : ""}`} />
          {busy && (
            <span className="absolute inset-x-4 bottom-4 rounded-full bg-surface/90 px-4 py-2 text-center text-sm font-medium backdrop-blur">
              Gemma is counting{result === null ? "…" : ""}
            </span>
          )}
        </button>
      ) : (
        <button
          onClick={() => input.current?.click()}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-line bg-surface text-muted transition hover:text-ink active:scale-[0.99]"
        >
          <Camera size={40} />
          <span className="font-medium">Take a photo of your haul</span>
        </button>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-[20px] bg-sunk px-4 py-3 text-sm">
          <Warning size={18} className="mt-0.5 shrink-0 text-danger" />
          {error}
        </p>
      )}

      {t && result && (
        <section aria-label="Result" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 rounded-[20px] bg-money-soft px-5 py-4">
            <span className="tabular font-mono text-4xl font-semibold tracking-tight text-money">{formatMoney(sure, scheme.currency)}</span>
            <span className="text-sm text-ink/80">
              {count} container{count === 1 ? "" : "s"} with the mark
              {t.maybe > 0 && upTo > sure ? `, up to ${formatMoney(upTo, scheme.currency)} if the ${t.maybe} unsure one${t.maybe === 1 ? " has" : "s have"} it too` : ""}.
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-[15px]">Gemma miscounted?</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
              <button onClick={() => setAdjust((a) => Math.max(-t.eligible, a - 1))} className="grid h-9 w-9 place-items-center rounded-full hover:bg-sunk" aria-label="One fewer">
                <Minus size={16} weight="bold" />
              </button>
              <span className="tabular w-8 text-center font-mono">{count}</span>
              <button onClick={() => setAdjust((a) => a + 1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-sunk" aria-label="One more">
                <Plus size={16} weight="bold" />
              </button>
            </span>
          </div>

          {(rejected.length > 0 || result.reading.notes) && (
            <ul className="flex flex-col gap-2 text-[15px] text-muted">
              {rejected.map((r) => (
                <li key={r} className="flex gap-2">
                  <Warning size={18} className="mt-0.5 shrink-0" />
                  {r}
                </li>
              ))}
              {result.reading.notes && <li className="pl-[26px]">{result.reading.notes}</li>}
            </ul>
          )}

          <Switch checked={donate} onChange={setDonate} label="Donate this one" hint="Counts towards your donated total instead of your goal." />

          <Button onClick={() => onLog({ containers: count, amount: sure, donated: donate })} className="min-h-14 text-base">
            {donate ? <HandHeart size={20} weight="bold" /> : <Check size={20} weight="bold" />}
            {donate ? "Log it as donated" : "Log it"}
          </Button>
          <p className="text-center text-[13px] text-muted">
            Read by {result.model} {result.tier === "edge" ? "on this phone; the photo never left it" : result.tier === "local" ? "on a laptop" : "in the cloud"}
            {result.gemmaMs ? ` in ${(result.gemmaMs / 1000).toFixed(1)} s` : ""}.
          </p>
        </section>
      )}

      <Button variant="ghost" onClick={onCancel}>
        Back to the route
      </Button>
    </div>
  );
}
