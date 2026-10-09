"use client";

// One front door for Gemma, wherever it runs.
//   server: /api/plan and /api/haul (Gemma on the laptop through Ollama, or in the cloud through AI Studio)
//   edge:   Gemma 4 E2B in this browser tab via WebGPU; the map data still comes
//           from /api/prepare, but the model and the haul photo never leave the device.

import { getScheme, type Scheme } from "../countries";
import type { PlanResult, Prepared } from "../plan/pipeline";
import { extractJson, haulTotals, type HaulTotals } from "./guard";
import { HAUL_SYSTEM, PLANNER_SYSTEM, haulPrompt, plannerPrompt } from "./prompts";
import { haulSchema, planPickSchema, type HaulReading, type PlanPick, type Tier } from "./schema";
import type { Outbound } from "./edge.worker";

export type PlanInput = {
  start: { lat: number; lon: number };
  minutes: number;
  intent: string;
  donate: boolean;
  history?: Record<string, number>;
  country?: string;
};

export type Planned = PlanResult & { tier: Tier; model: string; gemmaMs: number };
export type HaulChecked = { reading: HaulReading; totals: HaulTotals; tier: Tier; model: string; gemmaMs: number };

export class PlanError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new PlanError(json.error ?? "failed", json.message ?? "Something went wrong. Try again in a minute.");
  return json as T;
}

const request = (p: PlanInput) => ({ ...p, weekday: new Date().getDay() });

// ---------- server tier ----------

export async function planOnServer(p: PlanInput): Promise<Planned> {
  return postJson<Planned>("/api/plan", request(p));
}

export async function checkHaulOnServer(photo: Blob, country: string): Promise<HaulChecked> {
  const form = new FormData();
  form.set("photo", photo, "haul.jpg");
  form.set("country", country);
  const res = await fetch("/api/haul", { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new PlanError(json.error ?? "failed", "Gemma couldn't read that photo. Try again in better light.");
  return json as HaulChecked;
}

// ---------- edge tier ----------

export const EDGE_MODEL = process.env.NEXT_PUBLIC_EDGE_MODEL ?? "onnx-community/gemma-4-E2B-it-ONNX";
export const EDGE_MODEL_LABEL = "Gemma 4 E2B";

export type EdgeSupport = { ok: true; dtype: "q4f16" | "q4" } | { ok: false; reason: string };

/** Can this browser run Gemma on its own GPU? */
export async function edgeSupport(): Promise<EdgeSupport> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu) return { ok: false, reason: "This browser has no WebGPU. Chrome on Android or desktop does." };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "WebGPU is switched off or this GPU isn't supported." };
    return { ok: true, dtype: adapter.features.has("shader-f16") ? "q4f16" : "q4" };
  } catch {
    return { ok: false, reason: "WebGPU failed to start on this device." };
  }
}

type Listener = (m: Outbound) => void;

class EdgeGemma {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private nextId = 1;
  loaded = false;

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  load(dtype: "q4f16" | "q4"): Promise<void> {
    if (this.ready) return this.ready;
    this.worker = new Worker(new URL("./edge.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<Outbound>) => this.listeners.forEach((l) => l(e.data));
    this.ready = new Promise((resolve, reject) => {
      const off = this.on((m) => {
        if (m.type === "ready") {
          this.loaded = true;
          off();
          resolve();
        } else if (m.type === "error" && m.id === undefined) {
          off();
          this.ready = null;
          this.worker?.terminate();
          this.worker = null;
          reject(new Error(m.message));
        }
      });
    });
    this.worker.postMessage({ type: "load", model: EDGE_MODEL, dtype });
    return this.ready;
  }

  async generate(system: string, prompt: string, maxTokens: number, image?: Blob): Promise<{ text: string; ms: number }> {
    if (!this.ready || !this.worker) throw new Error("Gemma isn't loaded on this phone yet");
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const off = this.on((m) => {
        if (m.type === "result" && m.id === id) {
          off();
          resolve({ text: m.text, ms: m.ms });
        } else if (m.type === "error" && m.id === id) {
          off();
          reject(new Error(m.message));
        }
      });
      this.worker!.postMessage({ type: "generate", id, system, prompt, image, maxTokens });
    });
  }
}

export const edge = new EdgeGemma();

/** Ask the phone's Gemma for JSON matching a schema; one repair attempt if it rambles. */
async function edgeJson<T>(
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  system: string,
  prompt: string,
  maxTokens: number,
  image?: Blob,
): Promise<{ data: T | null; ms: number }> {
  let ms = 0;
  let last = "";
  for (const attempt of [0, 1]) {
    const p = attempt === 0 ? prompt : `${prompt}\n\nYour last reply was not valid JSON:\n${last.slice(0, 400)}\n\nReply again with only the JSON object.`;
    const r = await edge.generate(system, p, maxTokens, image);
    ms += r.ms;
    last = r.text;
    const parsed = schema.safeParse(extractJson(r.text));
    if (parsed.success) return { data: parsed.data, ms };
  }
  return { data: null, ms };
}

export async function planOnEdge(p: PlanInput): Promise<Planned> {
  const prepared = await postJson<Prepared>("/api/prepare", request(p));
  let pick: PlanPick | null = null;
  let gemmaMs = 0;
  if (prepared.hotspots.length) {
    const r = await edgeJson(planPickSchema, PLANNER_SYSTEM, plannerPrompt(prepared.plannerInput), 700);
    pick = r.data;
    gemmaMs = r.ms;
  }
  const result = await postJson<PlanResult>("/api/finish", { prepared, pick });
  return { ...result, tier: "edge", model: EDGE_MODEL_LABEL, gemmaMs };
}

export async function checkHaulOnEdge(photo: Blob, country: string): Promise<HaulChecked> {
  const scheme: Scheme = getScheme(country) ?? getScheme("ie")!;
  const r = await edgeJson(haulSchema, HAUL_SYSTEM, haulPrompt(scheme), 1200, photo);
  if (!r.data) throw new PlanError("haul_failed", "Gemma couldn't read that photo. Try again with the containers spread out.");
  return { reading: r.data, totals: haulTotals(r.data.items, scheme), tier: "edge", model: EDGE_MODEL_LABEL, gemmaMs: r.ms };
}

/** Downscale a photo before Gemma sees it: faster everywhere, and well under upload limits. */
export async function shrinkPhoto(file: Blob, maxSide = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}
