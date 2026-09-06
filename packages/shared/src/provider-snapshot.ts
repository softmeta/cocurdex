import type {
  AgentProviderSnapshot,
  CompatibleProviderModel,
} from "./contracts";

export function createProviderSnapshotForModel(
  item: CompatibleProviderModel,
): AgentProviderSnapshot {
  return {
    providerId: item.provider.id,
    providerName: item.provider.name,
    modelId: item.model.modelId,
    modelName: item.model.name,
    api: item.model.api,
    baseUrl: item.provider.baseUrl,
    modelBaseUrl: item.model.baseUrl ?? null,
    headersJson: item.provider.headersJson ?? null,
    providerCompatJson: item.provider.compatJson ?? null,
    modelCapabilities: item.model.capabilities,
    modelThinkingLevelMapJson: item.model.thinkingLevelMapJson ?? null,
    supportedReasoningEfforts: item.model.supportedReasoningEfforts,
    modelDefaultReasoningEffort: item.model.defaultReasoningEffort ?? null,
    supportsReasoning: item.model.reasoning ?? false,
    modelCostJson: item.model.costJson ?? null,
    modelCompatJson: item.model.compatJson ?? null,
    modelContextWindow: item.model.contextLimit ?? null,
    modelMaxTokens: item.model.outputLimit ?? null,
    reasoningEffort: null,
    thinkingLevel: null,
    serviceTier: null,
    fastMode: null,
    openCodeAgent: null,
    openCodeVariant: null,
  };
}
