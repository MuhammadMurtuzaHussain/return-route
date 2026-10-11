import { Mastra } from "@mastra/core/mastra";
import { haulAgent, plannerAgent, postAgent } from "./agents";
import { planWalkWorkflow, prepareWalkWorkflow } from "./workflows/planWalk";

export const mastra = new Mastra({
  agents: { plannerAgent, haulAgent, postAgent },
  workflows: { planWalkWorkflow, prepareWalkWorkflow },
});
