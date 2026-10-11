"use client";

import type { HaulReading } from "../ai/schema";

// The guided demo: a real walk planned from Terryland Forest Park, Galway, and a
// sample haul photo. Gemma runs live at every step; the recordings below are
// only used if Gemma can't be reached, and the demo says so when it uses them.

export const DEMO_START = { kind: "demo" as const, lat: 53.2845, lon: -9.042, name: "Terryland Forest Park, Galway" };
export const DEMO_MINUTES = 60;
export const DEMO_INTENT = "Head toward the river and finish at Aldi";
export const DEMO_CAUSE = "the local food bank";

/** The sample haul: generated with FLUX.1-dev, deposit-mark stickers added. Replace it with your own photo any time. */
const PHOTOS = ["/demo/haul.jpg"];

/** A live gemma4:e4b reading of public/demo/haul.jpg, kept for when Gemma is unreachable. */
export const RECORDED_READING: HaulReading = {
  items: [
    { material: "can", ml: 330, mark: "yes", damaged: false },
    { material: "can", ml: 330, mark: "yes", damaged: false },
    { material: "can", ml: 330, mark: "yes", damaged: false },
    { material: "can", ml: 330, mark: "yes", damaged: false },
    { material: "can", ml: 330, mark: "yes", damaged: false },
    { material: "can", ml: 330, mark: "yes", damaged: false },
    { material: "pet", ml: 500, mark: "yes", damaged: false },
    { material: "pet", ml: 2000, mark: "yes", damaged: false },
    { material: "glass", ml: 330, mark: "yes", damaged: false },
    { material: "glass", ml: 330, mark: "yes", damaged: false },
  ],
  notes: "Identified 10 drink containers. All appear undamaged. The deposit mark ('Re-turn') was visible on all containers.",
};

/** The sample haul as a JPEG, ready for Gemma. */
export async function samplePhoto(): Promise<Blob> {
  for (const src of PHOTOS) {
    const res = await fetch(src).catch(() => null);
    if (!res?.ok) continue;
    const img = new Image();
    img.src = URL.createObjectURL(await res.blob());
    try {
      await img.decode();
    } catch {
      continue;
    }
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth || 1024, img.naturalHeight || 768));
    const w = Math.round((img.naturalWidth || 1024) * scale);
    const h = Math.round((img.naturalHeight || 768) * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.88));
  }
  throw new Error("The sample photo is missing.");
}

export type DemoStep = "go" | "planning" | "route" | "walking" | "haul" | "voucher" | "logged" | "end";

export const DEMO_STEPS: { id: DemoStep; title: string; body: string }[] = [
  {
    id: "go",
    title: "Pick how long you've got",
    body: "We're starting at Terryland Forest Park in Galway with an hour, walking for a cause. The note tells Gemma where to head.",
  },
  {
    id: "planning",
    title: "Gemma plans the loop",
    body: "OpenStreetMap gives the picnic tables, pitches and off-licences. Yesterday's weather and the day of the week score them. Gemma picks and orders the stops.",
  },
  {
    id: "route",
    title: "Real places only",
    body: "Every stop and the return machine comes from the map. Plain code checks Gemma's picks and the estimate comes from the deposit table, never the model.",
  },
  {
    id: "walking",
    title: "Out for the walk",
    body: "In real life Start walking hands the loop to Google Maps, with a spoken briefing. Here it is in ten seconds.",
  },
  {
    id: "haul",
    title: "One photo of the haul",
    body: "Back home, lay it all out. Gemma counts every container and checks each one for the Re-turn mark.",
  },
  {
    id: "voucher",
    title: "A voucher you can trust",
    body: "Glass isn't in Re-turn, so it's struck off. Every cent is priced from the deposit table, not by Gemma. If the count is off, + and − fix it by hand.",
  },
  {
    id: "logged",
    title: "Give it away",
    body: "Donating turns the app green. You get an honest impact count and a post Gemma drafts for you to share.",
  },
  {
    id: "end",
    title: "That's the whole loop",
    body: "Plan, walk, scan, give. Gemma runs on a phone, a laptop or in the cloud, and your history never leaves your device.",
  },
];
