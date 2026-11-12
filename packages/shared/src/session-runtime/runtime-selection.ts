import { supportsInSessionRuntimeAxis } from "../agent-runtime-capabilities";
import { getAgentTraits } from "../agent-traits";
import type {
  AgentId,
  AgentProviderSnapshot,
  SessionRuntimeSelection,
} from "../contracts";

export function applySessionRuntime(
  snapshot: AgentProviderSnapshot,
  agentId: AgentId,
  supportsFastMode: boolean,
  runtime: SessionRuntimeSelection,
): AgentProviderSnapshot {
  const traits = getAgentTraits(agentId);
  const thinkingLevel =
    runtime.thinkingLevel === "default" ? null : runtime.thinkingLevel;
  return {
    ...snapshot,
    thinkingLevel: thinkingLevel ?? null,
    ...(traits.thinkingLevels === "reasoning-effort"
      ? { reasoningEffort: runtime.reasoningEffort ?? null }
      : {}),
    ...(traits.fastMode && supportsFastMode
      ? { fastMode: runtime.fastMode ?? false }
      : {}),
    ...(supportsInSessionRuntimeAxis(agentId, "speed")
      ? { serviceTier: runtime.serviceTier ?? null }
      : {}),
    ...(agentId === "opencode"
      ? {
          openCodeAgent: runtime.openCodeAgent ?? null,
          openCodeVariant: runtime.openCodeVariant ?? null,
        }
      : {}),
  };
}
