import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_TIMEOUT_MS = 2500;

interface ModelsDevLimit {
  context?: number;
  output?: number;
}

interface ModelsDevModel {
  id?: string;
  name?: string;
  limit?: ModelsDevLimit;
}

interface ModelsDevProvider {
  id?: string;
  api?: string;
  models?: Record<string, ModelsDevModel>;
}

type ModelsDevCatalog = Record<string, ModelsDevProvider>;

let catalogPromise: Promise<ModelsDevCatalog | null> | null = null;

function normalizeUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function fetchModelsDevCatalog() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODELS_DEV_TIMEOUT_MS);

  try {
    const response = await fetch(MODELS_DEV_API_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as unknown;
    return isRecord(body) ? (body as ModelsDevCatalog) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getModelsDevCatalog() {
  catalogPromise ??= fetchModelsDevCatalog();
  return catalogPromise;
}

function getCandidateProviders(
  catalog: ModelsDevCatalog,
  config: ProviderConfigRecord,
) {
  const normalizedBaseUrl = normalizeUrl(config.baseUrl);
  const candidates = new Map<string, ModelsDevProvider>();
  const exactProvider = catalog[config.id];

  if (exactProvider) {
    candidates.set(config.id, exactProvider);
  }

  for (const [providerId, provider] of Object.entries(catalog)) {
    if (normalizedBaseUrl && normalizeUrl(provider.api) === normalizedBaseUrl) {
      candidates.set(providerId, provider);
    }
  }

  return [...candidates.values()];
}

function findGlobalModel(
  catalog: ModelsDevCatalog,
  modelId: string,
): ModelsDevModel | null {
  const matches = Object.values(catalog).flatMap((provider) => {
    const model = provider.models?.[modelId];
    return model ? [model] : [];
  });

  return matches.length === 1 ? matches[0] : null;
}

function findModelMetadata(
  catalog: ModelsDevCatalog,
  candidates: ModelsDevProvider[],
  modelId: string,
) {
  for (const provider of candidates) {
    const model = provider.models?.[modelId];
    if (model) {
      return model;
    }
  }

  return findGlobalModel(catalog, modelId);
}

function mergeModelMetadata(
  model: ProviderModelRecord,
  existing: ProviderModelRecord | undefined,
  metadata: ModelsDevModel | null,
): ProviderModelRecord {
  return {
    ...model,
    api: existing?.api ?? model.api,
    enabled: existing?.enabled ?? model.enabled,
    source: existing?.source ?? model.source,
    name:
      existing?.source === "manual"
        ? existing.name
        : (metadata?.name ?? existing?.name ?? model.name),
    contextLimit:
      existing?.contextLimit ?? metadata?.limit?.context ?? model.contextLimit,
    outputLimit:
      existing?.outputLimit ?? metadata?.limit?.output ?? model.outputLimit,
    createdAt: existing?.createdAt ?? model.createdAt,
  };
}

export async function enrichProviderModelsWithModelsDev(
  config: ProviderConfigRecord,
  models: ProviderModelRecord[],
  existingModels: ProviderModelRecord[],
) {
  const catalog = await getModelsDevCatalog();

  if (!catalog) {
    return models;
  }

  const candidates = getCandidateProviders(catalog, config);
  const existingById = new Map(
    existingModels.map((model) => [model.modelId, model]),
  );

  return models.map((model) =>
    mergeModelMetadata(
      model,
      existingById.get(model.modelId),
      findModelMetadata(catalog, candidates, model.modelId),
    ),
  );
}
