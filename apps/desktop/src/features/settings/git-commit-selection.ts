import type {
  AgentId,
  AgentRuntimeProviderConfig,
  CommitMessageModelSelection,
  CompatibleProviderModel,
} from "@cocurdex/shared";
import {
  getThinkingLevelOptions,
  resolveThinkingLevel,
} from "@/features/composer";
import {
  getAgentRuntimePreferences,
  getOpenCodeRuntimeOptions,
  resolveOpenCodeRuntimeValue,
} from "@/features/sessions";

export type CommitRuntimeSelection = Pick<
  AgentRuntimeProviderConfig,
  | "reasoningEffort"
  | "thinkingLevel"
  | "serviceTier"
  | "fastMode"
  | "openCodeAgent"
  | "openCodeVariant"
>;

export function createCommitSelection(
  agentId: AgentId,
  providerId: string,
  modelId: string,
  item: CompatibleProviderModel | undefined,
): CommitMessageModelSelection {
  const preferences = getAgentRuntimePreferences(agentId);
  const thinkingOptions = getThinkingLevelOptions({
    agentType: agentId,
    supportsReasoning: item?.model.reasoning,
    thinkingLevelMapJson: item?.model.thinkingLevelMapJson,
    supportedReasoningEfforts: item?.model.supportedReasoningEfforts,
    defaultReasoningEffort: item?.model.defaultReasoningEffort ?? null,
  });
  const thinkingLevel = resolveThinkingLevel(
    thinkingOptions,
    preferences.thinkingLevel ?? "default",
  );
  const reasoningEffort = item?.model.supportedReasoningEfforts?.some(
    (option) => option.reasoningEffort === preferences.reasoningEffort,
  )
    ? preferences.reasoningEffort
    : null;
  const serviceTier = item?.model.serviceTiers?.some(
    (option) => option.id === preferences.serviceTier,
  )
    ? preferences.serviceTier
    : null;
  const openCodeOptions = getOpenCodeRuntimeOptions(item?.model);

  return {
    agentId,
    providerId,
    modelId,
    reasoningEffort,
    thinkingLevel: thinkingLevel === "default" ? null : thinkingLevel,
    serviceTier,
    fastMode:
      agentId === "claude-agent" && item?.model.supportsFastMode
        ? (preferences.fastMode ?? false)
        : null,
    openCodeAgent:
      agentId === "opencode"
        ? resolveOpenCodeRuntimeValue(
            preferences.openCodeAgent,
            openCodeOptions.agents,
          ) || null
        : null,
    openCodeVariant:
      agentId === "opencode"
        ? resolveOpenCodeRuntimeValue(
            preferences.openCodeVariant,
            openCodeOptions.variants,
          ) || null
        : null,
  };
}
