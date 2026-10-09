import { Mastra } from "@mastra/core/mastra";
import { haulAgent, plannerAgent } from "./agents";
import { planWalkWorkflow } from "./workflows/planWalk";

export const mastra = new Mastra({
  agents: { plannerAgent, haulAgent },
  workflows: { planWalkWorkflow },
});
