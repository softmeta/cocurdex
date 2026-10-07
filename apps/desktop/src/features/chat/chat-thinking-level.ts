import type {
  AgentProviderSnapshot,
  AgentThinkingLevel,
} from "@cocurdex/shared";
import { CHAT_AGENT_ID } from "@cocurdex/shared";
import {
  getThinkingLevelOptions,
  type ThinkingLevelOption,
} from "@/features/sessions";

export const NEW_CHAT_THINKING_LEVEL: AgentThinkingLevel = "medium";

export function getChatThinkingLevelOptions(
  snapshot: AgentProviderSnapshot | null | undefined,
): ThinkingLevelOption[] {
  if (!snapshot) return [];
  return getThinkingLevelOptions({
    agentType: CHAT_AGENT_ID,
    supportsReasoning: snapshot.supportsReasoning,
    thinkingLevelMapJson: snapshot.modelThinkingLevelMapJson,
  });
}

export function resolveChatThinkingLevel(
  options: ThinkingLevelOption[],
  preferred: AgentThinkingLevel | null | undefined,
  fallback: AgentThinkingLevel,
): AgentThinkingLevel | null {
  const offered = (level: AgentThinkingLevel | null | undefined) =>
    Boolean(level) && options.some((option) => option.level === level);
  if (preferred && offered(preferred)) return preferred;
  return offered(fallback) ? fallback : null;
}
