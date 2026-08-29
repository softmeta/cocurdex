import type {
  AgentId,
  AgentProviderSelection,
  CompatibleProviderModel,
} from "@cocurdex/shared";
import { CODEX_BUILT_IN_PROVIDER_ID } from "@cocurdex/shared";
import { desktopApi } from "@/lib";
import { usesAdapterOwnedModelCatalog } from "./adapter-owned-catalog";

const PROVIDER_MODEL_CACHE_STALE_MS = 60_000;
const PROVIDER_MODEL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PROVIDER_MODEL_CACHE_STORAGE_KEY =
  "cocurdex:new-session-provider-model-cache:v2";
const PROVIDER_MODEL_VALUE_SEPARATOR = "::";
const providerModelCacheAgentIds = new Set<AgentId>([
  "claude-agent",
  "codex",
  "grok-build",
  "opencode",
  "pi",
]);

interface ProviderModelCacheResult {
  defaultSelection: AgentProviderSelection | null;
  items: CompatibleProviderModel[];
}

type ProviderModelCache = Map<AgentId, ProviderModelCacheEntry>;

export interface ProviderModelCacheEntry {
  promise?: Promise<ProviderModelCacheResult>;
  result?: ProviderModelCacheResult;
  runtimeValidated?: boolean;
  updatedAt: number;
}

export const providerModelCache: ProviderModelCache = new Map();
let hasHydratedProviderModelCache = false;

// Provider settings mutate the same rows this cache holds. Mounted pickers keep
// showing the pre-edit list until something tells them to reload, so edits bump
// a version every subscriber watches.
const providerModelCacheListeners = new Set<() => void>();
let providerModelCacheVersion = 0;

function notifyProviderModelCacheListeners() {
  providerModelCacheVersion += 1;
  for (const listener of providerModelCacheListeners) {
    listener();
  }
}

export function subscribeProviderModelCache(listener: () => void) {
  providerModelCacheListeners.add(listener);
  return () => {
    providerModelCacheListeners.delete(listener);
  };
}

export function getProviderModelCacheVersion() {
  return providerModelCacheVersion;
}

export function invalidateProviderModelCache() {
  providerModelCache.clear();
  persistProviderModelCache();
  notifyProviderModelCacheListeners();
}

export function clearNewSessionProviderModelCacheForTest() {
  providerModelCache.clear();
  hasHydratedProviderModelCache = false;
  getProviderModelCacheStorage()?.removeItem(PROVIDER_MODEL_CACHE_STORAGE_KEY);
}

export function resetNewSessionProviderModelMemoryCacheForTest() {
  providerModelCache.clear();
  hasHydratedProviderModelCache = false;
}

function getProviderModelCacheStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProviderModelCacheResult(
  value: unknown,
): value is ProviderModelCacheResult {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    (value.defaultSelection === null || isRecord(value.defaultSelection))
  );
}

function sanitizeProviderModelCacheResult(
  agentId: AgentId,
  result: ProviderModelCacheResult,
) {
  if (agentId !== "codex") {
    return result;
  }

  return {
    items: result.items.filter(
      (item) => item.provider.id === CODEX_BUILT_IN_PROVIDER_ID,
    ),
    defaultSelection:
      result.defaultSelection?.providerId === CODEX_BUILT_IN_PROVIDER_ID
        ? result.defaultSelection
        : null,
  };
}

function getSanitizedCacheEntry(cache: ProviderModelCache, agentId: AgentId) {
  const entry = cache.get(agentId);
  if (!entry?.result) {
    return entry;
  }

  const result = sanitizeProviderModelCacheResult(agentId, entry.result);
  if (result === entry.result) {
    return entry;
  }

  const sanitizedEntry = { ...entry, result };
  cache.set(agentId, sanitizedEntry);
  return sanitizedEntry;
}

function hydrateProviderModelCache() {
  if (hasHydratedProviderModelCache) {
    return;
  }

  hasHydratedProviderModelCache = true;
  const storage = getProviderModelCacheStorage();
  const rawCache = storage?.getItem(PROVIDER_MODEL_CACHE_STORAGE_KEY);
  if (!rawCache) {
    return;
  }

  try {
    const parsed = JSON.parse(rawCache);
    if (!isRecord(parsed) || !isRecord(parsed.entries)) {
      storage?.removeItem(PROVIDER_MODEL_CACHE_STORAGE_KEY);
      return;
    }

    const now = Date.now();
    for (const [agentId, entry] of Object.entries(parsed.entries)) {
      if (!providerModelCacheAgentIds.has(agentId as AgentId)) {
        continue;
      }

      if (
        !isRecord(entry) ||
        typeof entry.updatedAt !== "number" ||
        now - entry.updatedAt >= PROVIDER_MODEL_CACHE_MAX_AGE_MS ||
        !isProviderModelCacheResult(entry.result)
      ) {
        continue;
      }

      providerModelCache.set(agentId as AgentId, {
        result: sanitizeProviderModelCacheResult(
          agentId as AgentId,
          entry.result,
        ),
        runtimeValidated: false,
        updatedAt: entry.updatedAt,
      });
    }
  } catch {
    storage?.removeItem(PROVIDER_MODEL_CACHE_STORAGE_KEY);
  }
}

function persistProviderModelCache() {
  const storage = getProviderModelCacheStorage();
  if (!storage) {
    return;
  }

  const now = Date.now();
  const entries = Object.fromEntries(
    [...providerModelCache.entries()].flatMap(([agentId, entry]) => {
      if (
        !providerModelCacheAgentIds.has(agentId) ||
        !entry.result ||
        now - entry.updatedAt >= PROVIDER_MODEL_CACHE_MAX_AGE_MS
      ) {
        return [];
      }

      return [[agentId, { result: entry.result, updatedAt: entry.updatedAt }]];
    }),
  );

  storage.setItem(
    PROVIDER_MODEL_CACHE_STORAGE_KEY,
    JSON.stringify({ entries }),
  );
}

export function getCachedProviderModelEntry(
  cache: ProviderModelCache,
  agentId: AgentId,
) {
  hydrateProviderModelCache();

  const entry = getSanitizedCacheEntry(cache, agentId);
  if (!entry?.result) {
    return null;
  }

  const isUsable =
    Date.now() - entry.updatedAt < PROVIDER_MODEL_CACHE_MAX_AGE_MS;
  return isUsable ? entry : null;
}

export function isProviderModelCacheFresh(
  entry: ProviderModelCacheEntry | null,
) {
  return (
    Boolean(entry?.result) &&
    Date.now() - (entry?.updatedAt ?? 0) < PROVIDER_MODEL_CACHE_STALE_MS
  );
}

export function shouldRevalidateProviderModels(
  agentId: AgentId,
  cacheIsFresh: boolean,
  runtimeValidated: boolean,
) {
  return (
    !cacheIsFresh ||
    (usesAdapterOwnedModelCatalog(agentId) && !runtimeValidated)
  );
}

export function loadProviderModelOptions(
  cache: ProviderModelCache,
  agentId: AgentId,
) {
  hydrateProviderModelCache();

  const entry = getSanitizedCacheEntry(cache, agentId);
  if (entry?.promise) {
    return entry.promise;
  }

  const promise = Promise.all([
    desktopApi.listCompatibleProvidersForAgent(agentId, {
      forceRefresh: usesAdapterOwnedModelCatalog(agentId),
    }),
    desktopApi.getAgentProviderDefault(agentId),
  ])
    .then(([items, defaultSelection]) => {
      const resolvedSelection =
        defaultSelection ?? entry?.result?.defaultSelection ?? null;
      const result = sanitizeProviderModelCacheResult(agentId, {
        defaultSelection: resolvedSelection,
        items,
      });
      cache.set(agentId, {
        result,
        runtimeValidated: true,
        updatedAt: Date.now(),
      });
      persistProviderModelCache();
      notifyProviderModelCacheListeners();
      return result;
    })
    .catch((error) => {
      const currentEntry = cache.get(agentId);
      if (currentEntry?.result) {
        cache.set(agentId, {
          result: currentEntry.result,
          runtimeValidated: currentEntry.runtimeValidated ?? false,
          updatedAt: currentEntry.updatedAt,
        });
      } else {
        cache.delete(agentId);
      }
      persistProviderModelCache();

      throw error;
    });

  cache.set(agentId, {
    promise,
    result: entry?.result,
    runtimeValidated: entry?.runtimeValidated ?? false,
    updatedAt: entry?.updatedAt ?? 0,
  });

  return promise;
}

export function getProviderModelValue(providerId: string, modelId: string) {
  return `${providerId}${PROVIDER_MODEL_VALUE_SEPARATOR}${modelId}`;
}

export function parseProviderModelValue(value: string) {
  const separatorIndex = value.indexOf(PROVIDER_MODEL_VALUE_SEPARATOR);
  if (separatorIndex < 0) {
    return null;
  }

  return {
    providerId: value.slice(0, separatorIndex),
    modelId: value.slice(
      separatorIndex + PROVIDER_MODEL_VALUE_SEPARATOR.length,
    ),
  };
}

export function updateCachedProviderDefault(
  cache: ProviderModelCache,
  agentId: AgentId,
  providerId: string,
  modelId: string,
) {
  const entry = cache.get(agentId);
  if (!entry?.result) {
    return;
  }

  const now = new Date().toISOString();
  entry.result = {
    ...entry.result,
    defaultSelection: {
      agentId,
      providerId,
      modelId,
      isDefault: true,
      createdAt: entry.result.defaultSelection?.createdAt ?? now,
      updatedAt: now,
    },
  };
  entry.updatedAt = Date.now();
  persistProviderModelCache();
}
