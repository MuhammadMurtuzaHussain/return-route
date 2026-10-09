import type { Scheme } from "../countries";
import type { Hotspot, ReturnPoint, Weather } from "../plan/types";

// The same words go to Gemma wherever it runs. Kept short: the phone tier is a
// 2B-effective model and every token costs battery.

export const PLANNER_SYSTEM = `You plan short walks that pay. The walker picks up drink cans and plastic bottles that carry a deposit, then returns them for cash (or donates it).

You are given numbered candidate stops and return points. Choose from them only, using their exact ids. Never invent places.

Rules:
- Pick up to the requested number of stops, in walking order, and one return point to finish at.
- Respect anything the walker asks for (time, where to finish, places to avoid). If they name a shop, finish at the return point with that name if there is one.
- "why" is one short sentence saying what is at that stop and why it should have cans today, using the facts listed for it. Good: "Five picnic tables two minutes from an off-licence, and Friday nights are busy here." Bad: "The weather is nice." No hype, no emojis.
- "lookFor" is one sentence, read aloud as they set off: where on this walk the containers will be (under benches, along hedges, by the pitch dugouts...). Calm and friendly.
- "tip" is one short safety or etiquette tip for today (gloves, broken glass, wet grass, leave bins alone...).
- Never promise money. The app shows the estimate.

Reply with JSON only.`;

export type PlannerInput = {
  minutes: number;
  intent: string;
  startNear: string | null;
  stopsWanted: number;
  weekdayName: string;
  weather: Weather | null;
  hotspots: (Hotspot & { distM: number })[];
  returnPoints: (ReturnPoint & { distM: number })[];
  suggestion: { stopIds: string[]; returnPointId: string };
  scheme: Scheme;
  donate: boolean;
};

export function plannerPrompt(p: PlannerInput): string {
  const stops = p.hotspots
    .map((h) => `- id=${h.id} | ${h.label} | ~${h.expected} containers | ${h.distM} m away | ${h.reasons.join("; ")}`)
    .join("\n");
  const rps = p.returnPoints
    .map((r) => `- id=${r.id} | ${r.name} | ${r.confidence === "machine" ? "mapped return machine" : "supermarket, very likely takes returns"} | ${r.distM} m away`)
    .join("\n");
  return `Walker is standing ${p.startNear ? `near ${p.startNear}` : "at the start"} and has ${p.minutes} minutes. Wants ${p.stopsWanted} stop${p.stopsWanted === 1 ? "" : "s"}.
Walker says: ${p.intent.trim() ? `"${p.intent.trim().slice(0, 300)}"` : "(nothing)"}
Today: ${p.weekdayName}. Weather: ${p.weather?.summary ?? "unknown"}.
Country: ${p.scheme.country} (${p.scheme.scheme}).${p.donate ? " The walker is donating today's refund to charity." : ""}

Candidate stops:
${stops || "(none nearby)"}

Return points:
${rps}

A good default is stops [${p.suggestion.stopIds.join(", ")}] finishing at ${p.suggestion.returnPointId}. Use it unless the walker's wishes point elsewhere.

JSON shape: {"title": string, "stops": [{"id": string, "why": string}], "returnPointId": string, "lookFor": string, "tip": string}`;
}

export const HAUL_SYSTEM = `You count drink containers in a photo of someone's litter haul so they know what to take to the deposit return machine.

For every drink container you can see, report:
- material: "can" (aluminium or steel), "pet" (plastic bottle), "glass", or "other"
- ml: your best guess at its size (330 for a standard can, 500 for a tall can or small bottle, 1500 or 2000 for big bottles)
- mark: "yes" if you can see the deposit mark on it, "no" if the label is clearly visible and has no mark, "unsure" otherwise
- damaged: true if it is crushed flat, torn or broken (machines reject these)

Count each container once. Ignore crisp packets, cups, wrappers and anything that is not a drink container. If the photo has no containers, return an empty list.

Reply with JSON only.`;

export function haulPrompt(scheme: Scheme): string {
  return `Country: ${scheme.country}. The deposit mark to look for is ${scheme.mark}.
In this scheme ${scheme.materials.join(", ")} containers from ${scheme.minMl} to ${scheme.maxMl} ml carry a deposit.

JSON shape: {"items": [{"material": "can"|"pet"|"glass"|"other", "ml": number, "mark": "yes"|"no"|"unsure", "damaged": boolean}], "notes": string}`;
}
