import type { z } from "zod";
import { mastra } from ".";
import { getModelConfig } from "./model";
import { haulPrompt, plannerPrompt, postPrompt, type PlannerInput, type PostFacts } from "@/lib/ai/prompts";
import { haulSchema, planPickSchema, type HaulReading, type PlanPick } from "@/lib/ai/schema";
import { extractJson, guardPostLine } from "@/lib/ai/guard";
import { reportGuard, traceAgent, traceChat, type Task } from "@/lib/server/telemetry";
import type { Scheme } from "@/lib/countries";

// Server-side Gemma calls (laptop and cloud tiers). Ollama gets native JSON
// schema mode; if a model ignores it, or the hosted endpoint does not support
// it, we retry once with the schema written into the prompt, then fall back to
// pulling JSON out of plain text. Each call is a Sentry agent span; each
// attempt a chat span with its tokens.

type AgentName = "plannerAgent" | "haulAgent" | "postAgent";
const agent = (name: AgentName) => mastra.getAgent(name);

async function structured<T>(
  task: Task,
  name: AgentName,
  input: Parameters<ReturnType<typeof agent>["generate"]>[0],
  schema: z.ZodType<T>,
  maxOutputTokens: number,
): Promise<T> {
  const { tier, modelId, providerOptions } = getModelConfig();
  const where = { tier, model: modelId };
  const temperature = 0.2;
  const attempt = async (inject: boolean, n: number) => {
    const res = await traceChat(where, { temperature, maxOutputTokens, attempt: n }, () =>
      agent(name).generate(input, {
        structuredOutput: { schema, jsonPromptInjection: inject },
        modelSettings: { temperature, maxOutputTokens },
        providerOptions,
      }),
    );
    if (res.object) return res.object as T;
    const parsed = schema.safeParse(extractJson(res.text ?? ""));
    if (parsed.success) return parsed.data;
    throw new Error("Model returned no usable JSON");
  };
  return traceAgent(agent(name).name, task, where, async () => {
    try {
      return await attempt(tier === "cloud", 1);
    } catch {
      try {
        const second = await attempt(true, 2);
        reportGuard(task, ["json_retry"], where);
        return second;
      } catch (e) {
        reportGuard(task, ["json_failed"], where);
        throw e;
      }
    }
  });
}

export async function pickWithGemma(input: PlannerInput): Promise<PlanPick> {
  return structured("plan", "plannerAgent", plannerPrompt(input), planPickSchema, 1024);
}

export async function readHaulWithGemma(image: Uint8Array, mediaType: string, scheme: Scheme): Promise<HaulReading> {
  return structured(
    "haul",
    "haulAgent",
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

/** One line for the walker's social post. Plain text; the guard strips numbers and tags. */
export async function writePostWithGemma(facts: PostFacts): Promise<string> {
  const { tier, modelId, providerOptions } = getModelConfig();
  const where = { tier, model: modelId };
  const settings = { temperature: 0.8, maxOutputTokens: 120 };
  const res = await traceAgent(agent("postAgent").name, "post", where, () =>
    traceChat(where, { ...settings, attempt: 1 }, () => agent("postAgent").generate(postPrompt(facts), { modelSettings: settings, providerOptions })),
  );
  return guardPostLine(res.text ?? "");
}
