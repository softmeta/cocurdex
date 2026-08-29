import {
  listCodexProviderModels,
  listOpenCodeProviderModels,
} from "@cocurdex/agent-adapters";
import type {
  AgentId,
  CompatibleProviderModel,
  ProviderConfigRecord,
  ProviderListModelsResult,
  ProviderModelRecord,
} from "@cocurdex/shared";
import {
  filterCompatibleProviderModels,
  getCompatibleProviderApis,
} from "@cocurdex/shared";
import type { DaemonState } from "./state";

export class DaemonProviderService {
  constructor(private readonly state: DaemonState) {}

  async listProviderConfigs() {
    return this.state.listProviderConfigs();
  }

  async listProviderModels(
    providerId?: string,
  ): Promise<ProviderListModelsResult> {
    return {
      models: await this.state.listProviderModels(providerId),
      error: null,
    };
  }

  async listCompatibleProviderModels(agentId: AgentId) {
    if (agentId === "codex") {
      // Codex owns its model catalog. Provider settings are not a model source
      // for the Codex adapter, even when their API is technically compatible.
      return listCodexProviderModels();
    }

    const providers = await this.state.listProviderConfigs();
    const models = await this.state.listProviderModels();
    const modelProviderIds = new Set(models.map((model) => model.providerId));
    const providerById = new Map(
      providers.map((provider) => [provider.id, provider]),
    );
    const modelItems = models.flatMap((model): CompatibleProviderModel[] => {
      const provider = providerById.get(model.providerId);
      return provider ? [{ provider, model }] : [];
    });
    const providerDefaultItems = providers
      .filter((provider) => !modelProviderIds.has(provider.id))
      .flatMap((provider): CompatibleProviderModel[] => {
        const model = this.createProviderDefaultModel(agentId, provider);
        return model ? [{ provider, model }] : [];
      });
    const compatibleItems = filterCompatibleProviderModels(agentId, [
      ...modelItems,
      ...providerDefaultItems,
    ]);

    if (agentId === "opencode") {
      return listOpenCodeProviderModels();
    }

    return compatibleItems;
  }

  listAgentProviderDefaults() {
    return this.state.listAgentProviderDefaults();
  }

  private createProviderDefaultModel(
    agentId: AgentId,
    provider: ProviderConfigRecord,
  ): ProviderModelRecord | null {
    const api = getCompatibleProviderApis(agentId)[0];

    if (!api) {
      return null;
    }

    return {
      providerId: provider.id,
      modelId: "",
      name: "Provider default",
      api,
      enabled: true,
      source: "manual",
      contextLimit: null,
      outputLimit: null,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }
}
