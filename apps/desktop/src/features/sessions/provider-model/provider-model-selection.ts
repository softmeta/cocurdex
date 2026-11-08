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

export { createProviderSnapshotForModel } from "@cocurdex/shared";
