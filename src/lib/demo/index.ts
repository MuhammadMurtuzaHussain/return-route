"use client";

import type { HaulReading } from "../ai/schema";

// The guided demo: a real walk planned from Terryland Forest Park, Galway, and the
// real haul from our test walk. Gemma plans the walk and drafts the post live; the
// recorded plan is only used if Gemma can't be reached, and the demo says so.

export const DEMO_START = { kind: "demo" as const, lat: 53.2845, lon: -9.042, name: "Terryland Forest Park, Galway" };
export const DEMO_MINUTES = 60;
export const DEMO_INTENT = "Head toward the river and finish at Aldi";
export const DEMO_CAUSE = "the local food bank";

/** The sample haul: generated with FLUX.1-dev, deposit-mark stickers added, so Gemma has marks it can read. */
const SAMPLE_PHOTO = "/demo/haul.jpg";
/** The real haul from our test walk in Galway, 11 October 2026. */
const REAL_PHOTO = "/demo/real-haul.jpg";

/**
 * The real haul, item by item, checked against the voucher the Re-turn machine at
 * Lidl printed for it: 2 cans at €0.15, €0.30. The Re-turn marks are too small in
 * the photo for Gemma to confirm, so the demo shows this checked reading and says so.
 */
export const REAL_HAUL: { reading: HaulReading; source: string } = {
  reading: {
    items: [
      { material: "can", ml: 500, mark: "yes", damaged: false },
      { material: "can", ml: 500, mark: "yes", damaged: false },
      { material: "can", ml: 330, mark: "unsure", damaged: true },
      { material: "can", ml: 250, mark: "unsure", damaged: true },
      { material: "pet", ml: 2000, mark: "unsure", damaged: true },
    ],
    notes: "Two cans carry the Re-turn mark. The crushed cans and the bottle stay out, because the machine refuses them.",
  },
  source: "Real haul, checked against the Re-turn voucher from Lidl, Galway, 11 Oct 2026",
};

/** The sample haul as a JPEG, ready for Gemma. */
export const samplePhoto = () => loadPhoto(SAMPLE_PHOTO);

/** The real haul from our test walk, for the guided demo. */
export const realHaulPhoto = () => loadPhoto(REAL_PHOTO);

async function loadPhoto(src: string): Promise<Blob> {
  const res = await fetch(src).catch(() => null);
  if (res?.ok) {
    const img = new Image();
    img.src = URL.createObjectURL(await res.blob());
    try {
      await img.decode();
    } catch {
      throw new Error("The sample photo is missing.");
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
    body: "This is the real bag from our test walk in Galway. In the app, Gemma counts every container in the photo and checks each one for the Re-turn mark.",
  },
  {
    id: "voucher",
    title: "A voucher you can trust",
    body: "Two cans with the Re-turn mark at 15c each. The crushed ones are struck off because the machine refuses them. The real machine at Lidl paid exactly this: €0.30.",
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
