import type { AgentRuntimePlugin } from "../agent-plugin";
import { createClaudeCliAdapter } from "./claude-cli-adapter";
import { listClaudeCliProviderModels } from "./claude-cli-models";
import { readClaudePlanUsage } from "./claude-plan-usage-probe";

export const claudeAgentPlugin: AgentRuntimePlugin = {
  createAdapter: createClaudeCliAdapter,
  slashCommands: "skills",
  listModels: (options) =>
    listClaudeCliProviderModels(undefined, undefined, options),
  readPlanUsage: readClaudePlanUsage,
};
