"use client";

import { useState } from "react";
import { Crosshair, Footprints, MapPin } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/countries";
import type { Goal, Totals } from "@/lib/client/store";
import { Button, Switch } from "./ui";

export type Where = { kind: "here"; lat: number; lon: number } | { kind: "demo"; lat: number; lon: number; name: string };

export const DEMO_START = { kind: "demo" as const, lat: 53.2845, lon: -9.042, name: "Terryland Forest Park, Galway" };

const DURATIONS = [
  { minutes: 30, label: "30 min", hint: "A loop round the block" },
  { minutes: 60, label: "1 hour", hint: "Two or three good spots" },
  { minutes: 90, label: "90 min", hint: "The long way round" },
];

export function GoScreen({
  onPlan,
  totals,
  goal,
  donateDefault,
  error,
}: {
  onPlan: (p: { minutes: number; intent: string; donate: boolean; where: Where }) => void;
  totals: Totals;
  goal: Goal;
  donateDefault: boolean;
  error: string | null;
}) {
  const [minutes, setMinutes] = useState(60);
  const [intent, setIntent] = useState("");
  const [donate, setDonate] = useState(donateDefault);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const go = (where?: Where) => {
    if (where) return onPlan({ minutes, intent, donate, where });
    if (!("geolocation" in navigator)) {
      setLocError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onPlan({ minutes, intent, donate, where: { kind: "here", lat: pos.coords.latitude, lon: pos.coords.longitude } });
      },
      () => {
        setLocating(false);
        setLocError("Couldn't get your location. Allow it in the browser, or try the Galway demo.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const progress = goal.amount > 0 ? Math.min(1, totals.earned / goal.amount) : 0;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[2.6rem] font-semibold leading-[1.05] tracking-tight">How long have you got?</h1>

      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="sr-only">Walk length</legend>
        {DURATIONS.map((d) => {
          const on = d.minutes === minutes;
          return (
            <label
              key={d.minutes}
              className={`flex cursor-pointer flex-col gap-1 rounded-[20px] border p-4 transition active:scale-[0.98] ${
                on ? "border-forest bg-forest text-on-forest" : "border-line bg-surface hover:bg-sunk"
              }`}
            >
              <input type="radio" name="minutes" className="sr-only" checked={on} onChange={() => setMinutes(d.minutes)} />
              <span className="text-xl font-semibold tracking-tight">{d.label}</span>
              <span className={`text-[13px] leading-snug ${on ? "opacity-80" : "text-muted"}`}>{d.hint}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="intent" className="text-[15px] font-medium">
          Anything I should know?
        </label>
        <textarea
          id="intent"
          rows={2}
          maxLength={300}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Finish at Tesco, stay off the main road"
          className="resize-none rounded-[20px] border border-line bg-surface px-4 py-3 text-[15px] placeholder:text-muted/80 focus:border-forest focus:outline-none"
        />
      </div>

      <Switch checked={donate} onChange={setDonate} label="Donate the refund" hint="Many return machines have a charity button." />

      <div className="flex flex-col gap-3">
        <Button onClick={() => go()} disabled={locating} className="min-h-14 text-base">
          <Footprints size={20} weight="bold" />
          {locating ? "Finding you…" : "Plan my walk"}
        </Button>
        <button
          onClick={() => go(DEMO_START)}
          className="inline-flex items-center justify-center gap-1.5 self-center text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          <MapPin size={15} />
          Or try it from Terryland Forest Park, Galway
        </button>
        {(locError || error) && (
          <p role="alert" className="flex items-start gap-2 rounded-[20px] bg-sunk px-4 py-3 text-sm">
            <Crosshair size={18} className="mt-0.5 shrink-0 text-danger" />
            {error ?? locError}
          </p>
        )}
      </div>

      <section aria-label="Your progress" className="flex flex-col gap-2 border-t border-line pt-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-muted">
            {goal.label}: <span className="tabular font-mono text-ink">{formatMoney(totals.earned, totals.currency)}</span> of{" "}
            <span className="tabular font-mono">{formatMoney(goal.amount, totals.currency)}</span>
          </span>
          {totals.donated > 0 && (
            <span className="text-sm text-muted">
              Donated <span className="tabular font-mono text-ink">{formatMoney(totals.donated, totals.currency)}</span>
            </span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
          <div className="h-full rounded-full bg-money transition-[width] duration-700" style={{ width: `${Math.max(progress * 100, totals.earned > 0 ? 2 : 0)}%` }} />
        </div>
        <span className="text-[13px] text-muted">
          {totals.walks === 0
            ? "Your first walk starts the count."
            : `${totals.walks} walk${totals.walks === 1 ? "" : "s"}, ${totals.containers} containers back in the loop.`}
        </span>
      </section>
    </div>
  );
}
