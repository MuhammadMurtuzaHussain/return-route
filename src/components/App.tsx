"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft } from "@phosphor-icons/react";
import {
  PlanError,
  checkHaulOnEdge,
  checkHaulOnServer,
  edge,
  planOnEdge,
  planOnServer,
  shrinkPhoto,
  type Planned,
} from "@/lib/ai/engine";
import { DEFAULT_COUNTRY } from "@/lib/countries";
import { DEFAULT_GOAL, DEFAULT_SETTINGS, DEFAULT_TOTALS, learn, useStored } from "@/lib/client/store";
import type { Tier } from "@/lib/ai/schema";
import { GoScreen, type Where } from "./GoScreen";
import { HaulScreen, type LoggedHaul } from "./HaulScreen";
import { Planning } from "./Planning";
import { RouteView } from "./RouteView";
import { SettingsSheet, type ServerStatus } from "./SettingsSheet";
import { TierPill } from "./TierPill";

type Screen = "go" | "planning" | "route" | "haul";

export function App() {
  const reduce = useReducedMotion();
  const [screen, setScreen] = useState<Screen>("go");
  const [plan, setPlan] = useState<Planned | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [server, setServer] = useState<ServerStatus>(null);
  const [settings, setSettings] = useStored("settings", DEFAULT_SETTINGS);
  const [totals, setTotals] = useStored("totals", DEFAULT_TOTALS);
  const [goal, setGoal] = useStored("goal", DEFAULT_GOAL);
  const [historyBox, setHistoryBox] = useStored<{ spots: Record<string, number> }>("history", { spots: {} });
  const [lastPlan, setLastPlan] = useStored<{ plan: Planned | null }>("last-plan", { plan: null });
  const [donateDefault, setDonateDefault] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setServer)
      .catch(() => setServer(null));
  }, []);

  // Picking up where you left off: if a walk was planned, you are probably back from it.
  useEffect(() => {
    if (lastPlan.plan && !plan) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the stored walk once after load
      setPlan(lastPlan.plan);
    }
  }, [lastPlan.plan, plan]);

  // The phone tier needs the model in memory; after a reload, fall back until it is reloaded.
  const edgeActive = settings.engine === "edge" && edge.loaded;
  const tier: Tier = edgeActive ? "edge" : (server?.tier ?? "local");

  const startPlan = useCallback(
    async ({ minutes, intent, donate, where }: { minutes: number; intent: string; donate: boolean; where: Where }) => {
      setError(null);
      setDonateDefault(donate);
      setScreen("planning");
      try {
        const input = { start: { lat: where.lat, lon: where.lon }, minutes, intent, donate, history: historyBox.spots, country: settings.country ?? undefined };
        const p = edgeActive ? await planOnEdge(input) : await planOnServer(input);
        setPlan(p);
        setLastPlan({ plan: p });
        setScreen("route");
        window.scrollTo({ top: 0 });
      } catch (e) {
        setError(e instanceof PlanError ? e.message : "Couldn't plan a walk just now. Check your connection and try again.");
        setScreen("go");
      }
    },
    [edgeActive, historyBox.spots, settings.country, setLastPlan],
  );

  const checkHaul = useCallback(
    async (file: Blob) => {
      const photo = await shrinkPhoto(file);
      const country = plan?.country ?? settings.country ?? DEFAULT_COUNTRY;
      return edgeActive ? checkHaulOnEdge(photo, country) : checkHaulOnServer(photo, country);
    },
    [edgeActive, plan?.country, settings.country],
  );

  const logHaul = (h: LoggedHaul) => {
    setTotals((t) => ({
      ...t,
      earned: Math.round((t.earned + (h.donated ? 0 : h.amount)) * 100) / 100,
      donated: Math.round((t.donated + (h.donated ? h.amount : 0)) * 100) / 100,
      containers: t.containers + h.containers,
      walks: t.walks + 1,
      currency: plan?.estimate.currency ?? t.currency,
    }));
    if (plan) {
      const expected = (plan.estimate.containersLow + plan.estimate.containersHigh) / 2;
      setHistoryBox((b) => ({ spots: learn(b.spots, plan.stops.map((s) => s.id), expected, h.containers) }));
    }
    setLastPlan({ plan: null });
    setPlan(null);
    setScreen("go");
  };

  const fade = reduce
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <nav className="flex h-16 items-center justify-between gap-3">
        {screen === "route" || screen === "haul" ? (
          <button
            onClick={() => setScreen(screen === "haul" ? "route" : "go")}
            className="-ml-2 inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-[15px] text-muted hover:text-ink"
          >
            <ArrowLeft size={18} />
            {screen === "haul" ? "Route" : "New walk"}
          </button>
        ) : (
          <span className="text-[17px] font-semibold tracking-tight">Return Route</span>
        )}
        <TierPill tier={tier} onClick={() => setSettingsOpen(true)} />
      </nav>

      <main className="flex-1 pt-4">
        <AnimatePresence mode="wait">
          <motion.div key={screen} {...fade}>
            {screen === "go" && (
              <>
                {plan && (
                  <button
                    onClick={() => setScreen("route")}
                    className="mb-6 flex w-full items-center justify-between gap-3 rounded-[20px] border border-line bg-surface px-4 py-3 text-left text-[15px] hover:bg-sunk"
                  >
                    <span>
                      Back from <span className="font-medium">{plan.title}</span>?
                    </span>
                    <span className="text-forest">Open</span>
                  </button>
                )}
                <GoScreen onPlan={startPlan} totals={totals} goal={goal} donateDefault={donateDefault} error={error} />
              </>
            )}
            {screen === "planning" && <Planning tier={tier} />}
            {screen === "route" && plan && <RouteView plan={plan} onHaul={() => setScreen("haul")} />}
            {screen === "haul" && (
              <HaulScreen
                country={plan?.country ?? settings.country ?? DEFAULT_COUNTRY}
                donateDefault={plan?.donate ?? donateDefault}
                check={checkHaul}
                onLog={logHaul}
                onCancel={() => setScreen(plan ? "route" : "go")}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        setSettings={setSettings}
        goal={goal}
        setGoal={setGoal}
        server={server}
      />
    </div>
  );
}
