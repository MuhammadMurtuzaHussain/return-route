import * as Sentry from "@sentry/nextjs";
import type { Tier } from "../ai/schema";

// Sentry agent tracing, set up in sentry.server.config.ts.
//
// Traces: each plan is a workflow span, each Mastra step a child (the map,
// weather and events steps overlap because they run in parallel), and each
// Gemma call a gen_ai.invoke_agent span with one gen_ai.chat span per attempt,
// carrying the model, tier, latency and tokens.
//
// Issues: Gemma suggests; the guard decides. Every time the guard has to step
// in, that is a Sentry issue tagged with where Gemma ran, so "how often does
// the 2B model on a phone need correcting, compared with the 26B in the cloud?"
// has a real answer.
//
// Never sent: prompts, coordinates, photos, or anything the walker typed.

const LABEL: Record<string, string> = {
  invented_stop: "Gemma picked a stop that wasn't on the map",
  invented_return_point: "Gemma picked a return point that wasn't on the map",
  return_point_as_stop: "Gemma listed the return point as a stop too",
  too_long: "Gemma's route didn't fit the time, so stops were dropped",
  no_valid_stops: "None of Gemma's stops were real, so the default route was used",
  no_model_output: "No usable plan from Gemma, so the default route was used",
  model_error: "Gemma call failed",
  json_retry: "Gemma needed a second try to return valid JSON",
  json_failed: "Gemma never returned valid JSON",
};

export const sentryEnabled = () => Boolean(Sentry.getClient()?.getDsn());

export type Task = "plan" | "haul" | "post";
type Where = { tier: Tier; model: string };

/** One Sentry issue per guard rule; each event says which tier and model tripped it. */
export function reportGuard(task: Task, flags: string[], where: Where) {
  if (!flags.length || !sentryEnabled()) return;
  for (const flag of flags) {
    const [rule, detail] = flag.split(/:([^]*)/);
    Sentry.withScope((scope) => {
      scope.setLevel(rule === "model_error" || rule === "json_failed" ? "error" : "warning");
      scope.setTags({ task, tier: where.tier, model: where.model, rule });
      scope.setFingerprint(["guard", task, rule]);
      if (detail) scope.setExtra("detail", detail.slice(0, 80));
      Sentry.captureMessage(`Guard: ${LABEL[rule] ?? rule}`);
    });
  }
  Sentry.getActiveSpan()?.setAttribute("guard.flags", flags.map((f) => f.split(":")[0]).join(","));
}

/** A workflow or one of its steps. */
export const traceStep = <T>(name: string, fn: () => Promise<T>) => Sentry.startSpan({ op: "workflow.step", name }, fn);
export const traceWorkflow = <T>(name: string, fn: () => Promise<T>) => Sentry.startSpan({ op: "workflow", name }, fn);

const SYSTEM: Record<Tier, string> = { edge: "transformers.js", local: "ollama", cloud: "gcp.gemini" };

/** One agent run (a planner pick, a haul reading, a post line). */
export function traceAgent<T>(agent: string, task: Task, where: Where, fn: () => Promise<T>): Promise<T> {
  return Sentry.startSpan(
    {
      op: "gen_ai.invoke_agent",
      name: `invoke_agent ${agent}`,
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.name": agent,
        "gen_ai.system": SYSTEM[where.tier],
        "gen_ai.request.model": where.model,
        "app.task": task,
        "app.tier": where.tier,
      },
    },
    fn,
  );
}

type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

/** One call to the model inside an agent run, with its token counts. */
export async function traceChat<T extends { usage?: Usage; totalUsage?: Usage }>(
  where: Where,
  settings: { temperature: number; maxOutputTokens: number; attempt: number },
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan(
    {
      op: "gen_ai.chat",
      name: `chat ${where.model}`,
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.system": SYSTEM[where.tier],
        "gen_ai.request.model": where.model,
        "gen_ai.request.temperature": settings.temperature,
        "gen_ai.request.max_tokens": settings.maxOutputTokens,
        "app.attempt": settings.attempt,
      },
    },
    async (span) => {
      const res = await fn();
      const u = res.totalUsage ?? res.usage;
      if (u?.inputTokens != null) span.setAttribute("gen_ai.usage.input_tokens", u.inputTokens);
      if (u?.outputTokens != null) span.setAttribute("gen_ai.usage.output_tokens", u.outputTokens);
      if (u?.totalTokens != null) span.setAttribute("gen_ai.usage.total_tokens", u.totalTokens);
      span.setAttribute("gen_ai.response.model", where.model);
      return res;
    },
  );
}
