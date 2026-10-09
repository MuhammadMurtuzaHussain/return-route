import type { z } from "zod";
import { haulAgent, plannerAgent } from "./agents";
import { getModelConfig } from "./model";
import { haulPrompt, plannerPrompt, type PlannerInput } from "@/lib/ai/prompts";
import { haulSchema, planPickSchema, type HaulReading, type PlanPick } from "@/lib/ai/schema";
import { extractJson } from "@/lib/ai/guard";
import type { Scheme } from "@/lib/countries";

// Server-side Gemma calls (laptop and cloud tiers). Ollama gets native JSON
// schema mode; if a model ignores it, or the hosted endpoint does not support
// it, we retry once with the schema written into the prompt, then fall back to
// pulling JSON out of plain text.

type Agentish = typeof plannerAgent | typeof haulAgent;

async function structured<T>(agent: Agentish, input: Parameters<(typeof plannerAgent)["generate"]>[0], schema: z.ZodType<T>, maxOutputTokens: number): Promise<T> {
  const { tier, providerOptions } = getModelConfig();
  const attempt = async (inject: boolean) => {
    const res = await (agent as typeof plannerAgent).generate(input, {
      structuredOutput: { schema, jsonPromptInjection: inject },
      modelSettings: { temperature: 0.2, maxOutputTokens },
      providerOptions,
    });
    if (res.object) return res.object as T;
    const parsed = schema.safeParse(extractJson(res.text ?? ""));
    if (parsed.success) return parsed.data;
    throw new Error("Model returned no usable JSON");
  };
  try {
    return await attempt(tier === "cloud");
  } catch {
    return await attempt(true);
  }
}

export async function pickWithGemma(input: PlannerInput): Promise<PlanPick> {
  return structured(plannerAgent, plannerPrompt(input), planPickSchema, 1024);
}

export async function readHaulWithGemma(image: Uint8Array, mediaType: string, scheme: Scheme): Promise<HaulReading> {
  return structured(
    haulAgent,
    [
      {
        role: "user",
        content: [
          { type: "image", image, mediaType },
          { type: "text", text: haulPrompt(scheme) },
        ],
      },
    ],
    haulSchema,
    2048,
  );
}
