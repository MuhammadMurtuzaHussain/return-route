"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Cloud, DeviceMobile, Laptop, Monitor, Moon, Sun, X } from "@phosphor-icons/react";
import { SCHEMES } from "@/lib/countries";
import { EDGE_MODEL_LABEL, edge, edgeSupport, type EdgeSupport } from "@/lib/ai/engine";
import type { Goal, Settings } from "@/lib/client/store";
import type { Tier } from "@/lib/ai/schema";
import { setTheme, useTheme, type Theme } from "@/lib/client/theme";
import { useDialog } from "@/lib/client/useDialog";
import { Button } from "./ui";

export type ServerStatus = { tier: Exclude<Tier, "edge">; model: string; ready: boolean } | null;

const EDGE_SIZE = "about 3.4 GB";

export function SettingsSheet({
  open,
  onClose,
  settings,
  setSettings,
  goal,
  setGoal,
  server,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  goal: Goal;
  setGoal: (g: Goal) => void;
  server: ServerStatus;
}) {
  const reduce = useReducedMotion();
  const [support, setSupport] = useState<EdgeSupport | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const ref = useDialog<HTMLDivElement>(open, onClose);
  const theme = useTheme();

  useEffect(() => {
    if (open && !support) edgeSupport().then(setSupport);
  }, [open, support]);

  useEffect(
    () =>
      edge.on((m) => {
        if (m.type === "progress") setProgress({ loaded: m.loaded, total: m.total });
      }),
    [],
  );

  const useEdge = async () => {
    if (!support?.ok) return;
    setLoading(true);
    setEdgeError(null);
    try {
      await edge.load(support.dtype);
      setSettings({ ...settings, engine: "edge" });
    } catch (e) {
      setEdgeError(`Gemma couldn't start on this device: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const ServerIcon = server?.tier === "cloud" ? Cloud : Laptop;
  const pct = progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-20 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="absolute inset-0 bg-ink/40" aria-label="Close settings" tabIndex={-1} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[20px] bg-bg px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:rounded-[20px]"
            initial={reduce ? false : { y: 40 }}
            animate={{ y: 0 }}
            exit={reduce ? undefined : { y: 40 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="settings-title" className="sign text-[2rem] font-bold uppercase leading-none">
                Settings
              </h2>
              <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface" aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <section className="flex flex-col gap-3">
              <h3 className="font-medium">Where Gemma runs</h3>
              <p className="text-sm text-muted">
                Same open-weight model family either way. You choose who sees your location and your photos.
                {server?.tier === "cloud" ? " This server sends them to Google AI Studio; on your phone, photos never leave it." : ""}
              </p>

              <button
                onClick={() => setSettings({ ...settings, engine: "server" })}
                className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition ${settings.engine === "server" ? "border-mark bg-surface" : "border-line hover:bg-surface"}`}
              >
                <ServerIcon size={22} className="mt-0.5 shrink-0" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{server?.tier === "cloud" ? "In the cloud" : "On my laptop"}</span>
                  <span className="text-sm text-muted">
                    {server ? `${server.model}${server.tier === "cloud" ? " served by Google AI Studio" : " through Ollama"}.` : "Checking…"}
                    {server && !server.ready ? " Not ready right now." : ""} Nothing to download.
                  </span>
                </span>
              </button>

              <div className={`flex flex-col gap-3 rounded-xl border-2 p-4 transition ${settings.engine === "edge" ? "border-mark bg-surface" : "border-line"}`}>
                <div className="flex items-start gap-3">
                  <DeviceMobile size={22} className="mt-0.5 shrink-0" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">On this phone</span>
                    <span className="text-sm text-muted">
                      {EDGE_MODEL_LABEL} runs on your phone&apos;s GPU. Your haul photos never leave it. One-time download of {EDGE_SIZE}; use wifi.
                    </span>
                  </span>
                </div>
                {support && !support.ok && <p className="text-sm text-mark-ink">{support.reason}</p>}
                {edgeError && <p className="text-sm text-mark-ink">{edgeError}</p>}
                {loading && (
                  <div className="flex flex-col gap-1.5" aria-live="polite">
                    <div className="h-1.5 overflow-hidden rounded-full bg-sunk">
                      <div className="h-full rounded-full bg-mark transition-[width]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular font-mono text-[13px] text-muted">
                      {progress?.total ? `${(progress.loaded / 1e9).toFixed(2)} of ${(progress.total / 1e9).toFixed(2)} GB` : "Starting…"}
                    </span>
                  </div>
                )}
                {settings.engine === "edge" && edge.loaded ? (
                  <span className="text-sm font-medium text-mark-ink">Running on this phone.</span>
                ) : (
                  <Button variant="post" onClick={useEdge} disabled={!support?.ok || loading}>
                    {loading ? "Loading Gemma…" : edge.loaded ? "Use it" : "Download and use"}
                  </Button>
                )}
              </div>
            </section>

            <section className="mt-8 flex flex-col gap-3">
              <h3 id="theme-label" className="font-medium">
                Appearance
              </h3>
              <div role="group" aria-labelledby="theme-label" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1 text-[14px] font-semibold">
                {(
                  [
                    ["system", "System", Monitor],
                    ["light", "Light", Sun],
                    ["dark", "Dark", Moon],
                  ] as [Theme, string, typeof Sun][]
                ).map(([t, label, Icon]) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    aria-pressed={theme === t}
                    className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg transition ${theme === t ? "bg-mark text-on-mark" : "text-muted hover:text-ink"}`}
                  >
                    <Icon size={16} weight={theme === t ? "fill" : "regular"} />
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-8 flex flex-col gap-3">
              <label htmlFor="country" className="font-medium">
                Deposit scheme
              </label>
              <select
                id="country"
                value={settings.country ?? ""}
                onChange={(e) => setSettings({ ...settings, country: e.target.value || null })}
                className="min-h-12 rounded-xl border border-line bg-surface px-4 text-[15px]"
              >
                <option value="">Work it out from where I am</option>
                {Object.values(SCHEMES)
                  .sort((a, b) => a.country.localeCompare(b.country))
                  .map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.country} ({s.scheme})
                    </option>
                  ))}
              </select>
            </section>

            <section className="mt-8 grid grid-cols-[1fr_7rem] gap-3">
              <div className="flex flex-col gap-2">
                <label htmlFor="goal-label" className="font-medium">
                  Saving for
                </label>
                <input
                  id="goal-label"
                  value={goal.label}
                  maxLength={40}
                  onChange={(e) => setGoal({ ...goal, label: e.target.value })}
                  className="min-h-12 rounded-xl border border-line bg-surface px-4 text-[15px]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="goal-amount" className="font-medium">
                  Amount
                </label>
                <input
                  id="goal-amount"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={goal.amount}
                  onChange={(e) => setGoal({ ...goal, amount: Math.max(1, Number(e.target.value) || 0) })}
                  className="tabular min-h-12 rounded-xl border border-line bg-surface px-4 font-mono text-[15px]"
                />
              </div>
            </section>

            <section className="mt-8 flex flex-col gap-2 text-sm leading-relaxed text-muted">
              <h3 className="font-medium text-ink">Good manners</h3>
              <p>Pick up litter from the ground only. Leave bins, and in Germany the Pfandring, for the people who rely on them. Gloves on, broken glass left alone, and don&apos;t crush cans: machines reject them.</p>
              <h3 className="mt-4 font-medium text-ink">About</h3>
              <p>
                Return Route is an unofficial, open-source project and isn&apos;t affiliated with Re-turn or any deposit scheme. Map data © OpenStreetMap contributors (ODbL). Weather from
                Open-Meteo. Routing by Valhalla. Estimates are guesses that improve as you log walks; they live only on this device.
              </p>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
