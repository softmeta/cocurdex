import type {
  AgentId,
  AgentProviderSnapshot,
  CompatibleProviderModel,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { usesAdapterOwnedModelCatalog } from "./adapter-owned-catalog";

export function getProviderModelSelectionValue(item: CompatibleProviderModel) {
  return `${item.provider.id}::${item.model.modelId}`;
}

export function getProviderModelSelectionLabel(item: CompatibleProviderModel) {
  return `${item.provider.name} / ${item.model.name}`;
}

export function resolveRuntimeProviderModel(
  agentType: AgentId,
  runtimeItems: readonly CompatibleProviderModel[],
  providerModels: readonly ProviderModelRecord[],
  snapshot: AgentProviderSnapshot | null | undefined,
) {
  if (!snapshot) {
    return null;
  }

  const selectionValue = `${snapshot.providerId}::${snapshot.modelId}`;
  const runtimeItem = runtimeItems.find(
    (item) => getProviderModelSelectionValue(item) === selectionValue,
  );
  if (runtimeItem) {
    return runtimeItem.model;
  }

  // Adapter-owned catalogs never resolve against the app-managed provider
  // table — ids can collide across catalogs and the row metadata differs.
  if (usesAdapterOwnedModelCatalog(agentType)) {
    return null;
  }

  return (
    providerModels.find(
      (model) =>
        model.providerId === snapshot.providerId &&
        model.modelId === snapshot.modelId,
    ) ?? null
  );
}

// Build the same provider snapshot used by the new-session picker. Runtime
// axes are reset because their valid values belong to the previous model.
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
