"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Camera, PlayCircle, Question } from "@phosphor-icons/react";
import {
  PlanError,
  checkHaulOnEdge,
  checkHaulOnServer,
  draftPostLine,
  edge,
  planOnEdge,
  planOnServer,
  shrinkPhoto,
  type Planned,
} from "@/lib/ai/engine";
import type { PostFacts } from "@/lib/ai/prompts";
import { DEFAULT_COUNTRY, getScheme } from "@/lib/countries";
import { useDark } from "@/lib/client/theme";
import { DEFAULT_GOAL, DEFAULT_SETTINGS, DEFAULT_TOTALS, learn, useStored, type Mode, type Totals } from "@/lib/client/store";
import { DEMO_CAUSE, DEMO_INTENT, DEMO_MINUTES, DEMO_START, DEMO_STEPS, REAL_HAUL, realHaulPhoto, samplePhoto } from "@/lib/demo";
import recordedPlan from "@/lib/demo/plan.json";
import type { Tier } from "@/lib/ai/schema";
import { DemoBar } from "./DemoBar";
import { Footer } from "./Footer";
import { GoScreen, type Where } from "./GoScreen";
import { HaulScreen, type LoggedHaul } from "./HaulScreen";
import { Logged } from "./Logged";
import { Planning } from "./Planning";
import { RouteView } from "./RouteView";
import { SettingsSheet, type ServerStatus } from "./SettingsSheet";
import { TierPill } from "./TierPill";
import { Welcome } from "./Welcome";

type Screen = "go" | "planning" | "route" | "haul" | "logged";

/** The guided demo keeps its own totals so it never touches your real history. */
type Demo = { step: number; totals: Totals; walked: boolean; read: boolean; give: number; note: string | null; run: number };

const stepOf = (id: (typeof DEMO_STEPS)[number]["id"]) => DEMO_STEPS.findIndex((s) => s.id === id);

/** "Kennedy Park Playground, Eyre Square" → "Eyre Square": the area, for the post. */
const areaOf = (plan: Planned | null) => plan?.stops[0]?.label.split(", ").pop() ?? null;

export function App() {
  const reduce = useReducedMotion();
  const [screen, setScreen] = useState<Screen>("go");
  const [plan, setPlan] = useState<Planned | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [server, setServer] = useState<ServerStatus>(null);
  const [settings, setSettings] = useStored("settings", DEFAULT_SETTINGS);
  const [storedTotals, setTotals] = useStored("totals", DEFAULT_TOTALS);
  const [goal, setGoal] = useStored("goal", DEFAULT_GOAL);
  const [historyBox, setHistoryBox] = useStored<{ spots: Record<string, number> }>("history", { spots: {} });
  const [lastPlan, setLastPlan] = useStored<{ plan: Planned | null }>("last-plan", { plan: null });
  const [seen, setSeen, seenLoaded] = useStored<{ welcome: boolean }>("seen", { welcome: false });
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [donateDefault, setDonateDefault] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [flash, setFlash] = useState(false);
  const [lastHaul, setLastHaul] = useState<LoggedHaul | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const planSeq = useRef(0);

  const inDemo = demo !== null;
  const mode: Mode = inDemo ? "cause" : settings.mode;
  const cause = inDemo ? DEMO_CAUSE : settings.cause.trim();
  const totals = demo?.totals ?? storedTotals;
  const country = plan?.country ?? settings.country ?? DEFAULT_COUNTRY;
  const rate = (getScheme(country) ?? getScheme(DEFAULT_COUNTRY)!).small;

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setServer)
      .catch(() => setServer(null));
  }, []);

  // Picking up where you left off: if a walk was planned, you are probably back from it.
  useEffect(() => {
    if (lastPlan.plan && !plan && !inDemo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the stored walk once after load
      setPlan(lastPlan.plan);
    }
  }, [lastPlan.plan, plan, inDemo]);

  // Giving turns the whole app green: cause mode, and the thank-you after any donation.
  const giving = mode === "cause" || (screen === "logged" && !!lastHaul?.donated);
  const dark = useDark();
  useEffect(() => {
    document.documentElement.dataset.mode = giving ? "cause" : "earn";
    // The phone's browser bar follows the page colour.
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = bg));
  }, [giving, dark]);

  // The phone tier needs the model in memory; after a reload, fall back until it is reloaded.
  const edgeActive = settings.engine === "edge" && edge.loaded;
  const tier: Tier = edgeActive ? "edge" : (server?.tier ?? "local");

  const toTop = () => window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  const setStep = (id: (typeof DEMO_STEPS)[number]["id"], extra: Partial<Demo> = {}) => setDemo((d) => (d ? { ...d, ...extra, step: stepOf(id) } : d));

  const startPlan = useCallback(
    async ({ minutes, intent, donate, where }: { minutes: number; intent: string; donate: boolean; where: Where }) => {
      const id = ++planSeq.current;
      setError(null);
      setDonateDefault(donate);
      setMinutes(minutes);
      setScreen("planning");
      if (inDemo) setDemo((d) => (d ? { ...d, step: stepOf("planning"), note: null } : d));
      try {
        const input = { start: { lat: where.lat, lon: where.lon }, minutes, intent, donate, history: inDemo ? {} : historyBox.spots, country: settings.country ?? undefined };
        const p = edgeActive ? await planOnEdge(input) : await planOnServer(input);
        if (id !== planSeq.current) return;
        setPlan(p);
        if (!inDemo) setLastPlan({ plan: p });
        else setDemo((d) => (d ? { ...d, step: stepOf("route") } : d));
        setScreen("route");
        window.scrollTo({ top: 0 });
      } catch (e) {
        if (id !== planSeq.current) return;
        if (inDemo) {
          // The demo must not stall on stage: show a walk recorded from the same start.
          setPlan({ ...(recordedPlan as unknown as Planned), donate: true });
          setDemo((d) => (d ? { ...d, step: stepOf("route"), note: "Gemma couldn't be reached, so this is a recorded plan" } : d));
          setScreen("route");
          window.scrollTo({ top: 0 });
          return;
        }
        setError(e instanceof PlanError ? e.message : "Couldn't plan a walk just now. Check your connection and try again.");
        setScreen("go");
      }
    },
    [edgeActive, historyBox.spots, settings.country, setLastPlan, inDemo],
  );

  const cancelPlan = () => {
    planSeq.current++;
    setScreen("go");
  };

  const checkHaul = useCallback(
    async (file: Blob) => {
      const photo = await shrinkPhoto(file);
      return edgeActive ? checkHaulOnEdge(photo, country) : checkHaulOnServer(photo, country);
    },
    [edgeActive, country],
  );

  const draft = useCallback((facts: PostFacts) => draftPostLine(facts, edgeActive), [edgeActive]);

  const logHaul = (h: LoggedHaul) => {
    const add = (t: Totals): Totals => ({
      ...t,
      earned: Math.round((t.earned + (h.donated ? 0 : h.amount)) * 100) / 100,
      donated: Math.round((t.donated + (h.donated ? h.amount : 0)) * 100) / 100,
      containers: t.containers + h.containers,
      walks: t.walks + 1,
      currency: plan?.estimate.currency ?? t.currency,
    });
    setLastHaul(h);
    if (inDemo) {
      setDemo((d) => (d ? { ...d, totals: add(d.totals), step: stepOf("logged") } : d));
    } else {
      setTotals(add);
      if (plan) {
        const expected = (plan.estimate.containersLow + plan.estimate.containersHigh) / 2;
        setHistoryBox((b) => ({ spots: learn(b.spots, plan.stops.map((s) => s.id), expected, h.containers) }));
      }
      setLastPlan({ plan: null });
    }
    setScreen("logged");
    window.scrollTo({ top: 0 });
  };

  const done = () => {
    if (!inDemo) setPlan(null);
    setScreen("go");
    window.scrollTo({ top: 0 });
    setFlash(true);
    setTimeout(() => setFlash(false), 1600);
  };

  // ---------- the guided demo ----------

  const startDemo = useCallback(() => {
    planSeq.current++;
    setWelcomeOpen(false);
    setSettingsOpen(false);
    setPlan(null);
    setLastHaul(null);
    setError(null);
    setScreen("go");
    setDemo((d) => ({ step: 0, totals: { ...DEFAULT_TOTALS }, walked: false, read: false, give: 0, note: null, run: (d?.run ?? 0) + 1 }));
    // Watching the demo covers what the welcome says.
    setSeen({ welcome: true });
    window.scrollTo({ top: 0 });
  }, [setSeen]);

  const exitDemo = () => {
    planSeq.current++;
    setDemo(null);
    setLastHaul(null);
    setPlan(lastPlan.plan);
    setScreen("go");
    window.scrollTo({ top: 0 });
    if (new URLSearchParams(window.location.search).has("demo")) window.history.replaceState(null, "", window.location.pathname);
  };

  // /?demo starts the demo straight away, for presenting.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once after mount
    if (new URLSearchParams(window.location.search).has("demo")) startDemo();
  }, [startDemo]);

  const demoId = demo ? DEMO_STEPS[demo.step].id : null;

  const demoNext = () => {
    if (!demo) return;
    switch (demoId) {
      case "go":
        void startPlan({ minutes: DEMO_MINUTES, intent: DEMO_INTENT, donate: true, where: DEMO_START });
        break;
      case "route":
        toTop();
        setStep("walking", { walked: false });
        break;
      case "walking":
        setStep("haul", { read: false });
        setScreen("haul");
        window.scrollTo({ top: 0 });
        break;
      case "voucher":
        setDemo((d) => (d ? { ...d, give: d.give + 1 } : d));
        break;
      case "logged":
        setStep("end");
        setScreen("go");
        window.scrollTo({ top: 0 });
        break;
    }
  };

  const nextLabel: string | null = (() => {
    switch (demoId) {
      case "go":
        return "Plan this walk";
      case "planning":
        return null;
      case "route":
        return "Walk it";
      case "walking":
        return demo?.walked ? "Back home with the bag" : "Skip ahead";
      case "haul":
        return null;
      case "voucher":
        return `Give it to ${DEMO_CAUSE}`;
      case "logged":
        return "Finish";
      default:
        return "Next";
    }
  })();

  // The walk plays on its own, then the demo moves home.
  useEffect(() => {
    if (demoId !== "walking" || !demo?.walked) return;
    const t = setTimeout(() => {
      setDemo((d) => (d && DEMO_STEPS[d.step].id === "walking" ? { ...d, step: stepOf("haul"), read: false } : d));
      setScreen("haul");
      window.scrollTo({ top: 0 });
    }, 1400);
    return () => clearTimeout(t);
  }, [demoId, demo?.walked]);

  const welcomeShown = !inDemo && (welcomeOpen || (seenLoaded && !seen.welcome));
  const closeWelcome = () => {
    setWelcomeOpen(false);
    setSeen({ welcome: true });
  };

  const fade = reduce
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } };

  const showBack = !inDemo && (screen === "route" || screen === "haul");

  return (
    <div className={`mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-4 ${inDemo ? "pb-72" : "pb-[max(2rem,env(safe-area-inset-bottom))]"}`}>
      <nav className="flex h-16 items-center justify-between gap-2">
        {showBack ? (
          <button
            onClick={() => setScreen(screen === "haul" ? "route" : "go")}
            className="-ml-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-[15px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={18} />
            {screen === "haul" ? "Route" : "New walk"}
          </button>
        ) : (
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="blade h-5 w-8 shrink-0 bg-mark [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%)]" aria-hidden="true" />
            <span className="semi whitespace-nowrap text-[18px] font-bold uppercase tracking-tight">Return Route</span>
            {inDemo && <span className="rounded-md bg-mark px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-on-mark">Demo</span>}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1">
          {!inDemo && (
            <button onClick={() => setWelcomeOpen(true)} aria-label="How Return Route works" className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-surface hover:text-ink">
              <Question size={18} />
            </button>
          )}
          <TierPill tier={tier} onClick={() => setSettingsOpen(true)} />
        </span>
      </nav>

      <main className="flex-1 pt-4">
        <AnimatePresence mode="wait">
          <motion.div key={`${screen}-${demo?.run ?? 0}`} {...fade}>
            {screen === "go" && (
              <>
                {plan && !inDemo && (
                  <button
                    onClick={() => setScreen("haul")}
                    className="mb-8 flex w-full items-center justify-between gap-3 rounded-xl bg-post px-4 py-3.5 text-left text-on-post transition active:scale-[0.99]"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">Back from {plan.title}?</span>
                      <span className="text-[14px] opacity-70">Photograph your haul for the voucher.</span>
                    </span>
                    <Camera size={22} />
                  </button>
                )}
                <GoScreen
                  key={inDemo ? `demo-${demo.run}` : "live"}
                  onPlan={startPlan}
                  totals={totals}
                  goal={goal}
                  rate={rate}
                  error={error}
                  flash={flash}
                  mode={mode}
                  setMode={(m) => !inDemo && setSettings({ ...settings, mode: m })}
                  cause={inDemo ? DEMO_CAUSE : settings.cause}
                  setCause={(c) => !inDemo && setSettings({ ...settings, cause: c })}
                  preset={demoId === "go" ? { intent: DEMO_INTENT, minutes: DEMO_MINUTES, demoStart: true } : undefined}
                />
                {!inDemo && (
                  <button
                    onClick={startDemo}
                    className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[14px] font-medium text-muted hover:text-ink"
                  >
                    <PlayCircle size={18} />
                    Watch the whole thing in a two-minute demo
                  </button>
                )}
              </>
            )}
            {screen === "planning" && <Planning tier={tier} minutes={minutes} forCause={mode === "cause"} onCancel={inDemo ? undefined : cancelPlan} />}
            {screen === "route" && plan && (
              <RouteView
                plan={plan}
                cause={plan.donate ? cause || null : null}
                demo={inDemo}
                walking={demoId === "walking"}
                onWalked={() => setDemo((d) => (d ? { ...d, walked: true } : d))}
                onHaul={() => {
                  if (inDemo) setStep("haul", { read: false });
                  setScreen("haul");
                }}
              />
            )}
            {screen === "haul" && (
              <HaulScreen
                country={country}
                donateDefault={plan?.donate ?? donateDefault}
                cause={mode === "cause" ? cause : null}
                check={checkHaul}
                onLog={logHaul}
                sample={inDemo ? realHaulPhoto : samplePhoto}
                auto={inDemo}
                known={inDemo ? REAL_HAUL : undefined}
                onRead={inDemo ? () => setStep("voucher", { read: true }) : undefined}
                giveSignal={demo?.give ?? 0}
              />
            )}
            {screen === "logged" && lastHaul && (
              <Logged
                haul={lastHaul}
                totals={totals}
                goal={goal}
                rate={rate}
                cause={lastHaul.donated ? cause || null : null}
                place={areaOf(plan)}
                weather={plan?.weather?.summary ?? null}
                draft={draft}
                onDone={inDemo ? demoNext : done}
                autoDraft={inDemo}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {screen !== "planning" && !inDemo && <Footer className={screen === "route" ? "mb-24" : ""} />}

      {demo && <DemoBar step={demo.step} next={nextLabel} onNext={demoNext} onExit={exitDemo} onReplay={startDemo} note={demo.note} />}

      <Welcome open={welcomeShown} onClose={closeWelcome} onSettings={() => setSettingsOpen(true)} onDemo={startDemo} />
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
