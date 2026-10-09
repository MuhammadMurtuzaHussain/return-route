"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Camera, DownloadSimple, NavigationArrow, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/countries";
import { toGpx } from "@/lib/plan/export";
import type { Planned } from "@/lib/ai/engine";
import { RouteMap } from "./RouteMap";
import { Button, LinkButton } from "./ui";

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
      { lat: plan.returnPoint.lat, lon: plan.returnPoint.lon, name: `Return: ${plan.returnPoint.name}` },
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

export function RouteView({ plan, onHaul }: { plan: Planned; onHaul: () => void }) {
  const reduce = useReducedMotion();
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const e = plan.estimate;
  const money = `${formatMoney(e.moneyLow, e.currency)} to ${formatMoney(e.moneyHigh, e.currency)}`;

  const item = (i: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 * i, duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-[20px]">
        <RouteMap plan={plan} className="h-[42dvh] min-h-64 w-full bg-sunk" />
      </div>

      <motion.header {...item(0)} className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{plan.title}</h1>
        <p className="text-muted">
          <span className="tabular font-mono">{plan.route.km.toFixed(1)} km</span>, about{" "}
          <span className="tabular font-mono">{plan.route.minutes + plan.stops.length * 5} min</span> with stops.{" "}
          {plan.weather?.summary && <span>{plan.weather.summary}.</span>}
        </p>
      </motion.header>

      <motion.section {...item(1)} aria-label="Estimate" className="flex flex-col gap-1 rounded-[20px] bg-money-soft px-5 py-4">
        <span className="tabular font-mono text-3xl font-semibold tracking-tight text-money">{money}</span>
        <span className="text-sm text-ink/80">
          A guess, not a promise: {e.containersLow} to {e.containersHigh} containers.
          {plan.donate ? " All of it going to charity." : ""} It gets sharper every walk you log.
        </span>
      </motion.section>

      <motion.ol {...item(2)} className="flex flex-col gap-4">
        {plan.stops.map((s, i) => (
          <li key={s.id} className="grid grid-cols-[28px_1fr] gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-forest text-[13px] font-semibold text-on-forest">{i + 1}</span>
            <span className="flex flex-col">
              <span className="font-medium">{s.label}</span>
              <span className="text-[15px] leading-snug text-muted">{s.why}</span>
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[28px_1fr] gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-money text-[13px] font-semibold text-surface">€</span>
          <span className="flex flex-col">
            <span className="font-medium">{plan.returnPoint.name}</span>
            <span className="text-[15px] leading-snug text-muted">
              {plan.returnPoint.confidence === "machine" ? "Return machine on the map." : "Supermarket. Most big ones take returns; check before you go in."}
              {plan.donate ? " Look for the donate button." : ""}
            </span>
          </span>
        </li>
      </motion.ol>

      <motion.div {...item(3)} className="flex flex-col gap-3">
        <LinkButton href={plan.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="min-h-14 text-base">
          <NavigationArrow size={20} weight="bold" />
          Open in Google Maps
        </LinkButton>
        <div className="grid grid-cols-2 gap-2">
          {canSpeak && (
            <Button
              variant="secondary"
              onClick={() => {
                if (speaking) {
                  window.speechSynthesis.cancel();
                  setSpeaking(false);
                } else {
                  setSpeaking(true);
                  speak(plan.briefing, () => setSpeaking(false));
                }
              }}
            >
              {speaking ? <SpeakerSlash size={18} /> : <SpeakerHigh size={18} />}
              {speaking ? "Stop" : "Hear briefing"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => downloadGpx(plan)} className={canSpeak ? "" : "col-span-2"}>
            <DownloadSimple size={18} />
            GPX
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-muted">{plan.briefing}</p>
      </motion.div>

      <motion.div {...item(4)} className="flex flex-col gap-2 border-t border-line pt-6">
        <Button variant="secondary" onClick={onHaul} className="min-h-14">
          <Camera size={20} />
          Back? Check my haul
        </Button>
        <p className="text-center text-[13px] text-muted">
          Planned by {plan.model} {plan.tier === "edge" ? "on this phone" : plan.tier === "local" ? "on a laptop" : "in the cloud"}
          {plan.gemmaMs ? ` in ${(plan.gemmaMs / 1000).toFixed(1)} s` : ""}.
        </p>
      </motion.div>
    </div>
  );
}
