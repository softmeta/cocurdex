import {
  listClaudeCliProviderModels,
  listCodexProviderModels,
  listGrokBuildProviderModels,
  listOpenCodeProviderModels,
  listPiProviderTemplates,
} from "@cocurdex/agent-adapters";
import type {
  AgentId,
  CompatibleProviderModel,
  ProviderAuthState,
  ProviderConfigRecord,
  ProviderListModelsResult,
  ProviderModelRecord,
  ProviderTemplateRecord,
  TitleModelProbeResult,
  TitleModelSelection,
} from "@cocurdex/shared";
import {
  filterCompatibleProviderModels,
  getCompatibleProviderApis,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
import type { ProviderCredentials } from "../provider-credentials/service";
import type { DaemonState } from "../state";
import { fetchProviderModels, listConfiguredProviderModels } from "./models";
import {
  getTitleModelSetting,
  isValidTitleModelSelection,
  probeTitleModel,
  setTitleModelSetting,
} from "./title";

type ProviderAuth = Pick<
  ProviderCredentials,
  "readApiKey" | "setApiKey" | "readAuthState" | "logout"
>;

export class DaemonProviderService {
  constructor(
    private readonly state: DaemonState,
    private readonly credentials: ProviderAuth,
  ) {}

  listProviderConfigs() {
    return this.state.listProviderConfigs();
  }

  getProviderConfig(providerId: string) {
    return this.state.getProviderConfig(providerId);
  }

  async saveProviderConfig(config: ProviderConfigRecord) {
    await this.state.saveProviderConfig(config);
    return config;
  }

  async deleteProviderConfig(providerId: string) {
    const config = await this.state.getProviderConfig(providerId);
    if (config?.apiKeySecretId) {
      await this.credentials.setApiKey(providerId, null);
    }
    // Cascade: models belong to the config; stale rows would resurface if
    // the same provider id is re-created later.
    await this.state.deleteProviderModelsByProvider(providerId);
    await this.state.deleteProviderConfig(providerId);
  }

  async listProviderModels(
    providerId?: string,
  ): Promise<ProviderListModelsResult> {
    return {
      models: await this.state.listProviderModels(providerId),
      error: null,
    };
  }

  async saveProviderModel(model: ProviderModelRecord) {
    await this.state.saveProviderModel(model);
    return model;
  }

  async deleteProviderModel(providerId: string, modelId: string) {
    await this.state.deleteProviderModel(providerId, modelId);
  }

  async fetchModels(providerId: string): Promise<ProviderListModelsResult> {
    const config = await this.state.getProviderConfig(providerId);
    if (!config) {
      return { models: [], error: "Provider not found" };
    }

    return fetchProviderModels(
      this.state,
      (id) => this.credentials.readApiKey(id),
      config,
    );
  }

  listAllModels(options: { providerIds?: string[]; forceRefresh?: boolean }) {
    return listConfiguredProviderModels(this.state, options);
  }

  listTemplates(): ProviderTemplateRecord[] {
    return listPiProviderTemplates();
  }

  listAgentProviderDefaults() {
    return this.state.listAgentProviderDefaults();
  }

  getAgentProviderDefault(agentId: AgentId) {
    return this.state.getAgentProviderDefault(agentId);
  }

  async setAgentProviderDefault(
    agentId: AgentId,
    providerId: string,
    modelId: string,
  ) {
    // Built-in (pi) provider models live only in the runtime cache, never in
    // the providerModels table, so validate against the full configured list
    // (persisted + built-in) instead of a DB-only lookup.
    const model = modelId
      ? (await listConfiguredProviderModels(this.state)).find(
          (item) => item.providerId === providerId && item.modelId === modelId,
        )
      : null;
    const provider = modelId
      ? null
      : await this.state.getProviderConfig(providerId);

    if (!model && !provider) {
      throw new Error("Provider model not found");
    }

    const now = new Date().toISOString();
    await this.state.saveAgentProviderDefault({
      agentId,
      providerId,
      modelId,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  getTitleModel(): Promise<TitleModelSelection | null> {
    return getTitleModelSetting(this.state);
  }

  async setTitleModel(selection: TitleModelSelection | null) {
    if (!isValidTitleModelSelection(selection)) {
      throw new Error("Invalid title model selection");
    }
    await setTitleModelSetting(this.state, selection);
  }

  probeTitleModel(
    selection: TitleModelSelection,
  ): Promise<TitleModelProbeResult> {
    if (!isValidTitleModelSelection(selection) || selection === null) {
      throw new Error("Invalid title model selection");
    }
    return probeTitleModel(
      this.state,
      (id) => this.credentials.readApiKey(id),
      selection,
    );
  }

  readAuthState(providerId: string): Promise<ProviderAuthState> {
    return this.credentials.readAuthState(providerId);
  }

  async authLogout(providerId: string) {
    await this.credentials.logout(providerId);
  }

  async listCompatibleProviderModels(
    agentId: AgentId,
    options: { forceRefresh?: boolean } = {},
  ) {
    if (agentId === "claude-agent") {
      try {
        return await listClaudeCliProviderModels(undefined, undefined, options);
      } catch (error) {
        logDaemonDiagnostic(
          "warn",
          "providerModels.claudeCli.catalogProbeFailed",
          {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        );
        if (options.forceRefresh) {
          throw error;
        }
        return [];
      }
    }

    if (agentId === "grok-build") {
      return listGrokBuildProviderModels(undefined, options);
    }

    const providers = await this.state.listProviderConfigs();
    const models = await listConfiguredProviderModels(this.state, {
      forceRefresh: options.forceRefresh,
    });
    const providerById = new Map(
      providers.map((provider) => [provider.id, provider]),
    );
    const modelItems = models.flatMap((model): CompatibleProviderModel[] => {
      const provider = providerById.get(model.providerId);
      return provider ? [{ provider, model }] : [];
    });

    // Only treat a provider as "has explicit models" if it has at least one
    // enabled model whose api is compatible with this agent. Providers
    // whose models are ALL incompatible still get a synthetic default so they
    // remain visible in the model picker for every agent.
    const compatibleApis = new Set(getCompatibleProviderApis(agentId));
    const providersWithCompatibleModels = new Set(
      models
        .filter((m) => m.enabled && compatibleApis.has(m.api))
        .map((m) => m.providerId),
    );
    const providerDefaultItems = providers
      .filter((provider) => !providersWithCompatibleModels.has(provider.id))
      .flatMap((provider): CompatibleProviderModel[] => {
        const model = this.createProviderDefaultModel(agentId, provider);
        return model ? [{ provider, model }] : [];
      });

    const compatibleItems = filterCompatibleProviderModels(agentId, [
      ...modelItems,
      ...providerDefaultItems,
    ]);

    if (agentId === "opencode") {
      return listOpenCodeProviderModels(options);
    }

    if (agentId === "pi") {
      return compatibleItems;
    }

    if (agentId !== "codex") {
      return compatibleItems;
    }

    const codexModels = await listCodexProviderModels(options);
    return [...codexModels, ...compatibleItems];
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
