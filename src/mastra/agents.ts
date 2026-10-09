import { Agent } from "@mastra/core/agent";
import { getModelConfig } from "./model";
import { HAUL_SYSTEM, PLANNER_SYSTEM } from "@/lib/ai/prompts";

export const plannerAgent = new Agent({
  id: "return-route-planner",
  name: "Return Route planner",
  instructions: PLANNER_SYSTEM,
  model: () => getModelConfig().model,
});

export const haulAgent = new Agent({
  id: "return-route-haul",
  name: "Return Route haul checker",
  instructions: HAUL_SYSTEM,
  model: () => getModelConfig().model,
});
