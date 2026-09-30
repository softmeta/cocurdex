import type { CompatibleProviderModel, ProviderApi } from "@cocurdex/shared";
import type {
  AgentInfo,
  ModelInfo,
  OpenCodeClient,
  ProviderInfo,
} from "@opencode/client";
import {
  connectOpenCode,
  formatOpenCodeError,
  logOpenCode,
} from "./opencode-runtime";

export function assertOpenCodeModelAvailable(
  models: ReadonlyArray<ModelInfo>,
  selection: { modelId: string; providerId: string },
) {
  const available = models.some(
    (model) =>
      model.enabled &&
      model.providerID === selection.providerId &&
      model.id === selection.modelId,
  );
  if (available) {
    return;
  }

  throw new Error(
    `OpenCode model ${selection.providerId}/${selection.modelId} is no longer available. Refresh the model list and select another model.`,
  );
}

const MODEL_CATALOG_READY_ATTEMPTS = 10;
const MODEL_CATALOG_READY_DELAY_MS = 200;

export async function listOpenCodeModelsWhenReady(
  client: Pick<OpenCodeClient, "model">,
  directory?: string,
): Promise<ModelInfo[]> {
  const request = directory ? { location: { directory } } : undefined;
  for (let attempt = 1; ; attempt++) {
    const models = await client.model.list(request);
    if (models.data.length > 0 || attempt >= MODEL_CATALOG_READY_ATTEMPTS) {
      return models.data;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, MODEL_CATALOG_READY_DELAY_MS),
    );
  }
}

function getModelCompatJson(model: ModelInfo, agents: string[]): string | null {
  const variants = model.variants.map((variant) => variant.id);
  if (variants.length === 0 && agents.length === 0) return null;

  return JSON.stringify({
    opencode: {
      agents,
      variants,
    },
  });
}

function getProviderApi(
  model: ModelInfo,
  provider: ProviderInfo | undefined,
): ProviderApi {
  const npm = (model.package ?? provider?.package ?? "").toLowerCase();

  if (npm.includes("anthropic")) {
    return "anthropic-messages";
  }

  if (model.providerID === "openai" && npm === "@ai-sdk/openai") {
    return "openai-responses";
  }

  return "openai-completions";
}

function getFiniteLimit(value: number) {
  return Number.isFinite(value) ? value : null;
}

export function getOpenCodePrimaryAgentIds(agents: ReadonlyArray<AgentInfo>) {
  return agents
    .filter(
      (agent) =>
        !agent.hidden && (agent.mode === "primary" || agent.mode === "all"),
    )
    .map((agent) => agent.id);
}

let cachedOpenCodeCatalog: CompatibleProviderModel[] | null = null;
let inFlightOpenCodeCatalog: Promise<CompatibleProviderModel[]> | null = null;

async function probeOpenCodeProviderModels(): Promise<
  CompatibleProviderModel[]
> {
  try {
    const client = await connectOpenCode();
    const [models, defaultModel, providers, agents] = await Promise.all([
      listOpenCodeModelsWhenReady(client),
      client.model.default(),
      client.provider.list(),
      client.agent.list(),
    ]);
    const now = new Date().toISOString();
    const primaryAgents = getOpenCodePrimaryAgentIds(agents.data);
    const providersById = new Map(
      providers.data.map((provider) => [provider.id, provider]),
    );

    return models
      .filter((model) => model.enabled)
      .map((model) => {
        const provider = providersById.get(model.providerID);
        return {
          provider: {
            id: model.providerID,
            name: provider?.name ?? model.providerID,
            baseUrl: "",
            enabled: true,
            apiKeySecretId: null,
            createdAt: now,
            updatedAt: now,
          },
          model: {
            providerId: model.providerID,
            modelId: model.id,
            name: model.name || model.id,
            api: getProviderApi(model, provider),
            enabled: true,
            source: "api" as const,
            contextLimit: getFiniteLimit(model.limit.context),
            outputLimit: getFiniteLimit(model.limit.output),
            compatJson: getModelCompatJson(model, primaryAgents),
            isDefault:
              defaultModel.data?.providerID === model.providerID &&
              defaultModel.data.id === model.id,
            createdAt: now,
            updatedAt: now,
          },
        };
      });
  } catch (error) {
    logOpenCode("warn", "Failed to list OpenCode provider models", {
      error: formatOpenCodeError(error),
    });
    throw error;
  }
}

function startOpenCodeCatalogProbe() {
  inFlightOpenCodeCatalog ??= probeOpenCodeProviderModels()
    .then((probed) => {
      cachedOpenCodeCatalog = probed;
      return probed;
    })
    .finally(() => {
      inFlightOpenCodeCatalog = null;
    });
  return inFlightOpenCodeCatalog;
}

export async function listOpenCodeProviderModels(
  options: { forceRefresh?: boolean } = {},
): Promise<CompatibleProviderModel[]> {
  if (cachedOpenCodeCatalog && !options.forceRefresh) {
    return cachedOpenCodeCatalog;
  }

  return startOpenCodeCatalogProbe();
}
