import type { AgentRuntimePlugin } from "../agent-plugin";
import { createCodexAdapter, listCodexProviderModels } from "./codex-adapter";
import { readCodexRateLimits } from "./codex-rate-limits";
import { generateCodexConversationTitle } from "./codex-title";

export const codexPlugin: AgentRuntimePlugin = {
  createAdapter: createCodexAdapter,
  slashCommands: "skills",
  listModels: listCodexProviderModels,
  generateConversationTitle: (input) =>
    generateCodexConversationTitle({
      message: input.message,
      ...(input.modelId ? { model: input.modelId } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    }),
  readPlanUsage: readCodexRateLimits,
};
