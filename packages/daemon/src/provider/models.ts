import {
  listPiBuiltInProviderIds,
  listPiProviderModels,
} from "@cocurdex/agent-adapters";
import {
  applyProviderModelOverride,
  type ProviderConfigRecord,
  type ProviderListModelsResult,
  type ProviderModelOverride,
  type ProviderModelRecord,
} from "@cocurdex/shared";
import type { DaemonState } from "../state";
import { enrichProviderModelsWithModelsDev } from "./models-dev";

const BUILT_IN_PROVIDER_MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

const builtInProviderModelsCache = new Map<
  string,
  { expiresAt: number; models: ProviderModelRecord[] }
>();

type ProviderModelListState = Pick<
  DaemonState,
  "listProviderConfigs" | "listProviderModels" | "listProviderModelOverrides"
>;

interface StoredProviderModelOverride {
  providerId: string;
  modelId: string;
  override: ProviderModelOverride;
}

type ProviderModelState = ProviderModelListState &
  Pick<DaemonState, "saveProviderModel">;

export function isBuiltInProviderConfig(
  config: Pick<ProviderConfigRecord, "id">,
) {
  return listPiBuiltInProviderIds().includes(config.id);
}

export function clearBuiltInProviderModelsCache() {
  builtInProviderModelsCache.clear();
}

async function listCachedPiProviderModels(
  provider: ProviderConfigRecord,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
) {
  if (!isBuiltInProviderConfig(provider)) {
    return null;
  }

  const now = Date.now();
  const cached = builtInProviderModelsCache.get(provider.id);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.models;
  }

  try {
    const models = await listPiProviderModels(provider);
    if (!models) {
      return null;
    }

    builtInProviderModelsCache.set(provider.id, {
      expiresAt: now + BUILT_IN_PROVIDER_MODELS_CACHE_TTL_MS,
      models,
    });
    return models;
  } catch (error) {
    if (cached) {
      return cached.models;
    }

    throw error;
  }
}

function modelKey(model: { providerId: string; modelId: string }) {
  return `${model.providerId}\0${model.modelId}`;
}

function mergeConfiguredProviderModels(
  persistedModels: ProviderModelRecord[],
  builtInModels: ProviderModelRecord[],
  overrides: StoredProviderModelOverride[],
) {
  const persistedByKey = new Map(
    persistedModels.map((model) => [modelKey(model), model]),
  );
  const overrideByKey = new Map(
    overrides.map((entry) => [modelKey(entry), entry.override]),
  );
  const catalogModels = builtInModels.map((catalog) => {
    const key = modelKey(catalog);
    const legacy = persistedByKey.get(key);
    persistedByKey.delete(key);
    const base = legacy ? { ...catalog, enabled: legacy.enabled } : catalog;
    return applyProviderModelOverride(base, overrideByKey.get(key) ?? {});
  });
  return [...persistedByKey.values(), ...catalogModels];
}

export async function findBuiltInCatalogModel(
  provider: ProviderConfigRecord,
  modelId: string,
) {
  const models = await listCachedPiProviderModels(provider).catch(() => null);
  return models?.find((model) => model.modelId === modelId) ?? null;
}

export async function listConfiguredProviderModels(
  state: ProviderModelListState,
  options: { providerIds?: string[]; forceRefresh?: boolean } = {},
) {
  const providerFilter = options.providerIds?.length
    ? new Set(options.providerIds)
    : null;
  const configuredProviders = (await state.listProviderConfigs()).filter(
    (provider) => !providerFilter || providerFilter.has(provider.id),
  );
  const persistedModels = (await state.listProviderModels()).filter(
    (model) => !providerFilter || providerFilter.has(model.providerId),
  );
  const builtInProviderIds = new Set(listPiBuiltInProviderIds());
  const builtInModels = (
    await Promise.all(
      configuredProviders
        .filter((provider) => builtInProviderIds.has(provider.id))
        .map(async (provider) => {
          try {
            return (
              (await listCachedPiProviderModels(provider, {
                forceRefresh: options.forceRefresh,
              })) ?? []
            );
          } catch {
            return [];
          }
        }),
    )
  ).flat();

  const overrides = (await state.listProviderModelOverrides()).filter(
    (entry) => !providerFilter || providerFilter.has(entry.providerId),
  );

  return mergeConfiguredProviderModels(
    persistedModels,
    builtInModels,
    overrides,
  );
}

export async function saveFetchedProviderModels(
  state: Pick<DaemonState, "saveProviderModel">,
  config: Pick<ProviderConfigRecord, "id">,
  models: ProviderModelRecord[],
) {
  if (isBuiltInProviderConfig(config)) {
    return;
  }

  for (const model of models) {
    await state.saveProviderModel(model);
  }
}

function parseProviderHeaders(headersJson?: string | null) {
  if (!headersJson) {
    return null;
  }

  const parsed = JSON.parse(headersJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provider headers must be a JSON object");
  }

  return parsed as Record<string, string>;
}

function buildProviderModelsUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("models", normalizedBaseUrl);
}

function mergeFetchedProviderModels(
  fetchedModels: ProviderModelRecord[],
  existingModels: ProviderModelRecord[],
) {
  const existingById = new Map(
    existingModels.map((model) => [model.modelId, model]),
  );

  return fetchedModels.map((model) => {
    const existing = existingById.get(model.modelId);
    if (!existing) {
      return model;
    }

    return {
      ...model,
      enabled: existing.enabled,
      source: existing.source,
      name: existing.source === "manual" ? existing.name : model.name,
      api: existing.api,
      contextLimit: existing.contextLimit ?? model.contextLimit,
      outputLimit: existing.outputLimit ?? model.outputLimit,
      capabilities: existing.capabilities ?? model.capabilities,
      reasoning: existing.reasoning ?? model.reasoning,
      thinkingLevelMapJson:
        existing.thinkingLevelMapJson ?? model.thinkingLevelMapJson,
      costJson: existing.costJson ?? model.costJson,
      compatJson: existing.compatJson ?? model.compatJson,
      defaultReasoningEffort:
        existing.defaultReasoningEffort ?? model.defaultReasoningEffort,
      supportedReasoningEfforts:
        existing.supportedReasoningEfforts ?? model.supportedReasoningEfforts,
      serviceTiers: existing.serviceTiers ?? model.serviceTiers,
      createdAt: existing.createdAt,
    };
  });
}

export async function fetchProviderModels(
  state: ProviderModelState,
  readApiKey: (providerId: string) => Promise<string | null>,
  config: ProviderConfigRecord,
): Promise<ProviderListModelsResult> {
  try {
    const piModels = await listCachedPiProviderModels(config, {
      forceRefresh: true,
    });
    if (piModels) {
      const existingModels = await state.listProviderModels(config.id);
      const enrichedModels = await enrichProviderModelsWithModelsDev(
        config,
        piModels,
        existingModels,
      );
      const models = mergeFetchedProviderModels(enrichedModels, existingModels);

      await saveFetchedProviderModels(state, config, models);

      return { models, error: null };
    }
  } catch {}

  try {
    const apiKey = await readApiKey(config.id);
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(parseProviderHeaders(config.headersJson) ?? {}),
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(buildProviderModelsUrl(config.baseUrl), {
      headers,
    });

    if (!response.ok) {
      throw new Error(`Model fetch failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const now = new Date().toISOString();
    const existingModels = await state.listProviderModels(config.id);
    const fetchedModels = (body.data ?? [])
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id))
      .map(
        (modelId): ProviderModelRecord => ({
          providerId: config.id,
          modelId,
          name: modelId,
          api: "openai-completions",
          enabled: true,
          source: "api",
          contextLimit: null,
          outputLimit: null,
          createdAt: now,
          updatedAt: now,
        }),
      );
    const enrichedModels = await enrichProviderModelsWithModelsDev(
      config,
      fetchedModels,
      existingModels,
    );
    const models = mergeFetchedProviderModels(enrichedModels, existingModels);

    await saveFetchedProviderModels(state, config, models);

    return { models, error: null };
  } catch (error) {
    return {
      models: await state.listProviderModels(config.id),
      error:
        error instanceof Error ? error.message : "Unknown model fetch error",
    };
  }
}
