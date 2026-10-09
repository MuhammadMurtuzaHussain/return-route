import { z } from "zod";

// One schema per Gemma task, shared by all three tiers (phone, laptop, cloud).

/** The planner picks stops from a list it is given; it never invents places. */
export const planPickSchema = z.object({
  title: z.string().describe("A short, friendly name for this walk, max 6 words"),
  stops: z
    .array(z.object({ id: z.string(), why: z.string().describe("One short sentence: why this stop, today") }))
    .max(3),
  returnPointId: z.string(),
  lookFor: z.string().describe("One sentence: where on this walk the cans and bottles will be"),
  tip: z.string().describe("One short safety or etiquette tip for today"),
});
export type PlanPick = z.infer<typeof planPickSchema>;

export const haulItemSchema = z.object({
  material: z.enum(["can", "pet", "glass", "other"]),
  ml: z.number().describe("Best guess at the container size in millilitres, e.g. 330, 500, 1500"),
  mark: z.enum(["yes", "no", "unsure"]).describe("Is the deposit mark visible on this container?"),
  damaged: z.boolean().describe("Crushed, torn or broken"),
});
export type HaulItem = z.infer<typeof haulItemSchema>;

export const haulSchema = z.object({
  items: z.array(haulItemSchema).max(120),
  notes: z.string().describe("One sentence for the person, e.g. what to leave out"),
});
export type HaulReading = z.infer<typeof haulSchema>;

export type Tier = "edge" | "local" | "cloud";

export const TIER_LABEL: Record<Tier, string> = {
  edge: "On this phone",
  local: "On my laptop",
  cloud: "In the cloud",
};
