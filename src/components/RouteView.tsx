"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Camera, DownloadSimple, NavigationArrow, SpeakerHigh, Stop } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/countries";
import { toGpx } from "@/lib/plan/export";
import type { Planned } from "@/lib/ai/engine";
import { RouteMap } from "./RouteMap";
import { LinkButton, Waymark } from "./ui";

function speak(text: string, onEnd: () => void) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  u.voice = voices.find((v) => v.lang === "en-IE") ?? voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
  u.rate = 0.98;
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
}

function downloadGpx(plan: Planned) {
  const gpx = toGpx(
    plan.title,
    [
      ...plan.stops.map((s, i) => ({ lat: s.lat, lon: s.lon, name: `${i + 1}. ${s.label}`, desc: s.why })),
      { lat: plan.returnPoint.lat, lon: plan.returnPoint.lon, name: `Cash in: ${plan.returnPoint.name}` },
    ],
    plan.route.line,
  );
  const url = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `return-route-${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.gpx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TIER_WORDS = { edge: "on this phone", local: "on a laptop", cloud: "in the cloud" } as const;

export function RouteView({
  plan,
  onHaul,
  cause,
  walking,
  onWalked,
  demo,
}: {
  plan: Planned;
  onHaul: () => void;
  cause?: string | null;
  walking?: boolean;
  onWalked?: () => void;
  /** In the guided demo the walk plays on the map instead of opening Google Maps. */
  demo?: boolean;
}) {
  const reduce = useReducedMotion();
  const [speaking, setSpeaking] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after mount
    setCanSpeak("speechSynthesis" in window);
    return () => window.speechSynthesis?.cancel();
  }, []);

  const e = plan.estimate;
  const walkMinutes = plan.route.minutes + plan.stops.length * 5;
  const rise = (i: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.12 + 0.07 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } };

  const toggleBriefing = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      speak(plan.briefing, () => setSpeaking(false));
    }
  };

  return (
    <div className="flex flex-col">
      <RouteMap plan={plan} walking={walking} onWalked={onWalked} className="-mx-4 h-[52dvh] min-h-72 bg-sunk" />

      <div className="relative -mx-4 -mt-6 rounded-t-[20px] bg-bg px-4 pt-6">
        <motion.header {...rise(0)} className="flex flex-col gap-3">
          <h1 className="sign text-[2.7rem] font-bold uppercase leading-[0.95]">{plan.title}</h1>
          <dl className="grid grid-cols-3 border-y border-line font-mono text-[12px] uppercase">
            {[
              ["Walk", `${plan.route.km.toFixed(1)} km`],
              ["Time", `~${walkMinutes} min`],
              ["Stops", String(plan.stops.length)],
            ].map(([k, v], i) => (
              <div key={k} className={`flex flex-col gap-1 py-3 ${i ? "border-l border-line pl-3" : ""}`}>
                <dt className="text-muted">{k}</dt>
                <dd className="tabular text-[17px] font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </motion.header>

        <motion.section {...rise(1)} aria-label="Estimate" className="mt-7">
          <p className="sign text-[3.1rem] font-bold leading-none">
            <span className="tabular">{formatMoney(e.moneyLow, e.currency)}</span>
            <span className="semi mx-2 text-[1.6rem] font-medium text-muted">to</span>
            <span className="tabular bg-mark px-1.5 text-on-mark [box-decoration-break:clone]">{formatMoney(e.moneyHigh, e.currency)}</span>
          </p>
          <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-muted">
            Roughly {e.containersLow} to {e.containersHigh} containers{plan.donate ? `, all of it for ${cause || "charity"}` : ""}. A guess, and it gets sharper every walk you log.
          </p>
        </motion.section>

        <motion.ol {...rise(2)} className="relative mt-8 flex flex-col gap-6">
          <span className="absolute bottom-6 left-[13px] top-4 border-l-2 border-dashed border-line" aria-hidden="true" />
          {plan.stops.map((s, i) => (
            <li key={s.id} className="relative grid grid-cols-[28px_1fr] gap-4">
              <Waymark>{i + 1}</Waymark>
              <div className="flex flex-col gap-1 pt-0.5">
                <span className="text-[17px] font-semibold leading-snug">{s.label}</span>
                <span className="text-[15px] leading-relaxed text-muted">{s.why}</span>
              </div>
            </li>
          ))}
          <li className="relative grid grid-cols-[28px_1fr] gap-4">
            <Waymark tone="post">€</Waymark>
            <div className="flex flex-col gap-1 pt-0.5">
              <span className="text-[17px] font-semibold leading-snug">Cash in at {plan.returnPoint.name}</span>
              <span className="text-[15px] leading-relaxed text-muted">
                {plan.returnPoint.confidence === "machine" ? "A return machine on the map." : "Most big supermarkets take returns. Ask at the door if you can't see the machine."}
                {plan.donate ? " Press its charity button instead of printing a voucher." : ""}
              </span>
            </div>
          </li>
        </motion.ol>

        <motion.figure {...rise(3)} className="mt-9 border-l-2 border-mark pl-4">
          <blockquote className="text-[15px] leading-relaxed">{plan.briefing}</blockquote>
          <figcaption className="mt-2 font-mono text-[12px] uppercase text-muted">
            {plan.model} {TIER_WORDS[plan.tier]}
            {plan.gemmaMs ? `, ${(plan.gemmaMs / 1000).toFixed(1)}s` : ""}
          </figcaption>
        </motion.figure>

        <motion.button
          {...rise(4)}
          onClick={onHaul}
          className="mt-9 flex w-full items-center justify-between gap-3 rounded-xl border border-line px-4 py-4 text-left transition hover:bg-surface active:scale-[0.99]"
        >
          <span className="flex flex-col">
            <span className="font-semibold">Back with a bag?</span>
            <span className="text-[14px] text-muted">Photograph it and Gemma prints your voucher.</span>
          </span>
          <Camera size={24} />
        </motion.button>
      </div>

      {!demo && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/92 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl gap-2">
            <LinkButton href={plan.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="min-h-14 flex-1 text-base">
              <NavigationArrow size={20} weight="fill" />
              Start walking
            </LinkButton>
            {canSpeak && (
              <button
                onClick={toggleBriefing}
                className="flex min-h-14 w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl bg-post text-on-post transition active:scale-[0.97]"
                aria-label={speaking ? "Stop the briefing" : "Hear the briefing"}
              >
                {speaking ? <Stop size={18} weight="fill" /> : <SpeakerHigh size={18} />}
                <span className="font-mono text-[10px] uppercase">{speaking ? "Stop" : "Briefing"}</span>
              </button>
            )}
            <button
              onClick={() => downloadGpx(plan)}
              className="flex min-h-14 w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl bg-post text-on-post transition active:scale-[0.97]"
              aria-label="Download GPX for Strava, Komoot or OsmAnd"
            >
              <DownloadSimple size={18} />
              <span className="font-mono text-[10px] uppercase">GPX</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
