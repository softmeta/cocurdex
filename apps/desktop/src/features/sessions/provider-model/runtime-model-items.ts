import type {
  AgentId,
  AgentProviderSnapshot,
  CompatibleProviderModel,
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { filterCompatibleProviderModels } from "@cocurdex/shared";
import { usesAdapterOwnedModelCatalog } from "./adapter-owned-catalog";
import {
  getCachedProviderModelEntry,
  providerModelCache,
} from "./provider-model-cache";
import { getProviderModelSelectionValue } from "./provider-model-selection";

// Builds the in-session model list from the adapter cache, app-managed
// provider table (Pi only), and the session snapshot.
export function getRuntimeModelItems(
  agentType: AgentId,
  providerModels: ProviderModelRecord[],
  providerConfigs: ProviderConfigRecord[],
  snapshot: AgentProviderSnapshot | null,
) {
  const providerById = new Map(
    providerConfigs.map((provider) => [provider.id, provider]),
  );
  const adapterOwnedCatalog = usesAdapterOwnedModelCatalog(agentType);
  // Adapter-owned agents must not inherit global provider-table rows. Their
  // picker source of truth is the same discovery cache the new-session card
  // uses, plus the live session snapshot.
  const fallbackItems = adapterOwnedCatalog
    ? []
    : providerModels.flatMap((model): CompatibleProviderModel[] => {
        const provider = providerById.get(model.providerId);
        return provider ? [{ model, provider }] : [];
      });
  const cachedItems =
    getCachedProviderModelEntry(providerModelCache, agentType)?.result?.items ??
    [];
  const itemsByValue = new Map<string, CompatibleProviderModel>();

  for (const item of [...cachedItems, ...fallbackItems]) {
    itemsByValue.set(getProviderModelSelectionValue(item), item);
  }

  if (snapshot) {
    const currentValue = `${snapshot.providerId}::${snapshot.modelId}`;
    if (!itemsByValue.has(currentValue)) {
      const now = new Date().toISOString();
      const provider = providerById.get(snapshot.providerId) ?? {
        id: snapshot.providerId,
        name: snapshot.providerName,
        baseUrl: snapshot.baseUrl,
        enabled: true,
        apiKeySecretId: null,
        headersJson: snapshot.headersJson ?? null,
        compatJson: snapshot.providerCompatJson ?? null,
        createdAt: now,
        updatedAt: now,
      };
      itemsByValue.set(currentValue, {
        provider,
        model: {
          providerId: snapshot.providerId,
          modelId: snapshot.modelId,
          name: snapshot.modelName,
          api: snapshot.api,
          enabled: true,
          source: "manual",
          baseUrl: snapshot.modelBaseUrl ?? null,
          contextLimit: snapshot.modelContextWindow ?? null,
          outputLimit: snapshot.modelMaxTokens ?? null,
          capabilities: snapshot.modelCapabilities,
          reasoning: snapshot.supportsReasoning,
          thinkingLevelMapJson: snapshot.modelThinkingLevelMapJson ?? null,
          costJson: snapshot.modelCostJson ?? null,
          compatJson: snapshot.modelCompatJson ?? null,
          supportedReasoningEfforts: snapshot.supportedReasoningEfforts,
          defaultReasoningEffort: snapshot.modelDefaultReasoningEffort ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }

  if (adapterOwnedCatalog) {
    return [...itemsByValue.values()].filter(
      (item) => item.provider.enabled && item.model.enabled,
    );
  }

  return filterCompatibleProviderModels(agentType, [...itemsByValue.values()]);
}
