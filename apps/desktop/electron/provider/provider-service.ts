import {
  cancelCodexLogin,
  generateCodexConversationTitle,
  generatePiConversationTitle,
  listClaudeCliProviderModels,
  listCodexProviderModels,
  listGrokBuildProviderModels,
  listOpenCodeProviderModels,
  listPiBuiltInProviderIds,
  listPiProviderModels,
  listPiProviderTemplates,
  logoutCodex,
  readCodexAccount,
  startCodexChatGptLogin,
} from "@cocurdex/agent-adapters/desktop-provider";
import type {
  AgentId,
  CodexLoginOutcome,
  CommitMessageModelSelection,
  CompatibleProviderModel,
  ProviderConfigRecord,
  ProviderListModelsResult,
  ProviderModelRecord,
  RefineSessionTitlePayload,
  SendSessionMessagePayload,
  SessionRecord,
  TitleModelProbeResult,
  TitleModelSelection,
} from "@cocurdex/shared";
import {
  filterCompatibleProviderModels,
  getCompatibleProviderApis,
} from "@cocurdex/shared";
import { ipcMain, safeStorage } from "electron";
import {
  deleteProviderConfig,
  deleteProviderModel,
  deleteProviderModelsByProvider,
  deleteProviderSecret,
  getAgentProviderDefault,
  getCommitMessageModelSetting,
  getProviderConfig,
  getProviderSecret,
  getTitleModelSetting,
  listAgentProviderDefaults,
  listProviderConfigs,
  listProviderModels,
  saveAgentProviderDefault,
  saveProviderConfig,
  saveProviderModel,
  saveProviderSecret,
  setCommitMessageModelSetting,
  setProviderApiKeySecretId,
  setTitleModelSetting,
} from "../chat";
import { createLogger } from "../logging";
import { enrichProviderModelsWithModelsDev } from "./models-dev-metadata";

const titleLogger = createLogger("session-title-provider");
const secretsLogger = createLogger("provider-secrets");
const providerModelsLogger = createLogger("provider-models");
const BUILT_IN_PROVIDER_MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

const builtInProviderModelsCache = new Map<
  string,
  { expiresAt: number; models: ProviderModelRecord[] }
>();

function getEncryptedSecretValue(value: string) {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString("base64");
  }

  // Base64 is encoding, not encryption — the key sits readable on disk. This
  // happens on Linux without a keyring / secret service; surface it loudly so
  // the silent downgrade is at least visible in diagnostics.
  secretsLogger.warn("safeStorage.unavailablePlaintextFallback");
  return Buffer.from(value, "utf8").toString("base64");
}

function decryptSecretValue(encryptedValue: string) {
  const buffer = Buffer.from(encryptedValue, "base64");

  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buffer);
  }

  return buffer.toString("utf8");
}

async function resolveProviderApiKey(config: ProviderConfigRecord | null) {
  if (!config?.apiKeySecretId) {
    return null;
  }

  const secret = await getProviderSecret(config.apiKeySecretId);
  return secret ? decryptSecretValue(secret.encryptedValue) : null;
}

export async function buildRuntimeProviderConfig(
  session: SendSessionMessagePayload["session"],
) {
  if (session.agentType === "codex") {
    return null;
  }

  const snapshot = session.providerSnapshot;

  if (!snapshot) {
    return null;
  }

  const provider = await getProviderConfig(snapshot.providerId);
  const apiKey = await resolveProviderApiKey(provider);

  return {
    ...snapshot,
    apiKey,
  };
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

export function isBuiltInProviderConfig(
  config: Pick<ProviderConfigRecord, "id">,
) {
  return listPiBuiltInProviderIds().includes(config.id);
}

export async function saveFetchedProviderModels(
  config: Pick<ProviderConfigRecord, "id">,
  models: ProviderModelRecord[],
  saveModel: (model: ProviderModelRecord) => Promise<void> = saveProviderModel,
) {
  if (isBuiltInProviderConfig(config)) {
    return;
  }

  for (const model of models) {
    await saveModel(model);
  }
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

function mergeConfiguredProviderModels(
  persistedModels: ProviderModelRecord[],
  builtInModels: ProviderModelRecord[],
) {
  const modelsById = new Map<string, ProviderModelRecord>();

  for (const model of persistedModels) {
    modelsById.set(`${model.providerId}\0${model.modelId}`, model);
  }

  for (const model of builtInModels) {
    const key = `${model.providerId}\0${model.modelId}`;
    if (!modelsById.has(key)) {
      modelsById.set(key, model);
    }
  }

  return [...modelsById.values()];
}

export async function listConfiguredProviderModels(
  providers?: ProviderConfigRecord[],
  savedModels?: ProviderModelRecord[],
  options: { forceRefresh?: boolean } = {},
) {
  const configuredProviders = providers ?? (await listProviderConfigs());
  const persistedModels = savedModels ?? (await listProviderModels());
  const builtInProviderIds = new Set(listPiBuiltInProviderIds());
  const builtInModels = (
    await Promise.all(
      configuredProviders
        .filter((provider) => builtInProviderIds.has(provider.id))
        .map(async (provider) => {
          try {
            return (await listCachedPiProviderModels(provider, options)) ?? [];
          } catch {
            return [];
          }
        }),
    )
  ).flat();

  return mergeConfiguredProviderModels(persistedModels, builtInModels);
}

// Cap the title request so a slow or hung provider never blocks the refine
// IPC handler. Title generation is best-effort — on timeout we keep the
// locally derived fallback title. Reasoning models (e.g. deepseek-v4-flash)
// spend several seconds thinking before emitting the title, so keep this
// generous; the refine flow is fire-and-forget and never blocks the UI.
const TITLE_GENERATION_TIMEOUT_MS = 60_000;

// Settings "test connectivity" is interactive — keep a tighter cap so a hung
// provider fails fast instead of leaving the button spinning for a full minute.
const TITLE_PROBE_TIMEOUT_MS = 20_000;
const TITLE_PROBE_MESSAGE =
  "Hello, this is a connectivity check for the title generation model.";

// Provider + model records plus the resolved API key — everything the pi ai
// layer needs to rebuild a Model for a one-shot title request.
export interface TitleModelRecords {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
  apiKey: string | null;
}

// Reconstruct provider records from the session's provider snapshot. Snapshot
// is the source of truth for session-isolated routing; per-model baseUrl
// overrides the provider baseUrl to match how the agent runtime reaches this
// model.
function buildSnapshotProviderRecords(
  runtime: NonNullable<Awaited<ReturnType<typeof buildRuntimeProviderConfig>>>,
): { provider: ProviderConfigRecord; model: ProviderModelRecord } {
  const now = new Date().toISOString();
  const provider: ProviderConfigRecord = {
    id: runtime.providerId,
    name: runtime.providerName,
    baseUrl: runtime.modelBaseUrl || runtime.baseUrl,
    enabled: true,
    apiKeySecretId: null,
    headersJson: runtime.headersJson ?? null,
    compatJson: runtime.providerCompatJson ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const model: ProviderModelRecord = {
    providerId: runtime.providerId,
    modelId: runtime.modelId,
    name: runtime.modelName,
    api: runtime.api,
    enabled: true,
    source: "manual",
    baseUrl: runtime.modelBaseUrl ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return { provider, model };
}

// Resolve the dedicated title-generation model if one is configured and still
// resolvable. Returns null to signal "fall back to the caller's own model".
// Shared by built-in Pi sessions and chat-conversation title generation.
export async function resolveDedicatedTitleModel(): Promise<TitleModelRecords | null> {
  const selection = await getTitleModelSetting();
  if (!selection) {
    return null;
  }

  const provider = await getProviderConfig(selection.providerId);
  const model = (await listConfiguredProviderModels()).find(
    (candidate) =>
      candidate.providerId === selection.providerId &&
      candidate.modelId === selection.modelId,
  );

  if (!provider || !model) {
    // The configured model was deleted or its provider removed. Fall back to
    // the session model rather than failing title generation outright.
    titleLogger.debug("titleGeneration.dedicatedModelUnresolved", {
      modelId: selection.modelId,
      providerId: selection.providerId,
    });
    return null;
  }

  const apiKey = await resolveProviderApiKey(provider);
  titleLogger.debug("titleGeneration.dedicatedModelResolved", {
    api: model.api,
    baseUrl: model.baseUrl ?? provider.baseUrl,
    hasApiKey: Boolean(apiKey),
    modelId: model.modelId,
    providerId: provider.id,
  });
  return { provider, model, apiKey };
}

// Resolve the session's own model from its provider snapshot.
async function resolveSessionTitleModel(
  session: SessionRecord,
): Promise<TitleModelRecords | null> {
  const runtime = await buildRuntimeProviderConfig(session);

  if (!runtime?.baseUrl || !runtime.modelId) {
    titleLogger.debug("titleGeneration.unavailable", {
      hasBaseUrl: Boolean(runtime?.baseUrl),
      hasModelId: Boolean(runtime?.modelId),
      sessionId: session.id,
    });
    return null;
  }

  // Prefer the fully configured records: they round-trip pi's reasoning/
  // compat metadata, which drives per-vendor "disable thinking" handling.
  // Snapshot-built records are the fallback for sessions whose model is no
  // longer configured.
  const configuredProvider = await getProviderConfig(runtime.providerId);
  const configuredModel = (await listConfiguredProviderModels()).find(
    (candidate) =>
      candidate.providerId === runtime.providerId &&
      candidate.modelId === runtime.modelId,
  );
  const { provider, model } =
    configuredProvider && configuredModel
      ? { provider: configuredProvider, model: configuredModel }
      : buildSnapshotProviderRecords(runtime);

  titleLogger.debug("titleGeneration.sessionModelResolved", {
    api: model.api,
    baseUrl: model.baseUrl ?? provider.baseUrl,
    configured: Boolean(configuredProvider && configuredModel),
    hasApiKey: Boolean(runtime.apiKey),
    modelId: model.modelId,
    providerId: provider.id,
    sessionId: session.id,
  });
  return { provider, model, apiKey: runtime.apiKey };
}

export async function generateProviderSessionTitle(
  session: SessionRecord,
  payload: Pick<RefineSessionTitlePayload, "message" | "fallbackTitle">,
) {
  const useCodexCli = session.agentType === "codex";
  const records =
    session.agentType === "pi"
      ? ((await resolveDedicatedTitleModel()) ??
        (await resolveSessionTitleModel(session)))
      : null;

  if (!records && !useCodexCli) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TITLE_GENERATION_TIMEOUT_MS,
  );

  const startedAt = Date.now();

  try {
    titleLogger.debug("titleGeneration.requestStarted", {
      messageLength: payload.message.length,
      modelId: records?.model.modelId ?? session.providerSnapshot?.modelId,
      sessionId: session.id,
    });
    let generated: string | null;
    if (useCodexCli) {
      const modelId =
        records?.model.modelId ?? session.providerSnapshot?.modelId;
      generated = await generateCodexConversationTitle({
        message: payload.message,
        ...(modelId ? { model: modelId } : {}),
        signal: controller.signal,
      });
    } else if (records) {
      generated = await generatePiConversationTitle({
        provider: records.provider,
        model: records.model,
        apiKey: records.apiKey,
        message: payload.message,
        signal: controller.signal,
      });
    } else {
      return null;
    }
    // Empty output: keep the locally derived fallback title.
    const title = generated ?? payload.fallbackTitle;

    titleLogger.debug("titleGeneration.completed", {
      durationMs: Date.now() - startedAt,
      generatedTitleLength: title.length,
      sessionId: session.id,
    });

    return title;
  } catch (error) {
    titleLogger.info("titleGeneration.skipped", {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown error",
      sessionId: session.id,
    });

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// One-shot connectivity check for the dedicated title model. Uses the real
// title-generation path so the probe exercises API key, base URL, and model
// routing — not just a lightweight /models list call.
export async function probeTitleModel(
  selection: TitleModelSelection,
): Promise<TitleModelProbeResult> {
  const startedAt = Date.now();

  const provider = await getProviderConfig(selection.providerId);
  const model = (await listConfiguredProviderModels()).find(
    (candidate) =>
      candidate.providerId === selection.providerId &&
      candidate.modelId === selection.modelId,
  );

  if (!provider || !model) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: "Model or provider not found",
    };
  }

  const apiKey = await resolveProviderApiKey(provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TITLE_PROBE_TIMEOUT_MS);

  try {
    titleLogger.debug("titleGeneration.probeStarted", {
      modelId: model.modelId,
      providerId: provider.id,
    });
    const title = await generatePiConversationTitle({
      provider,
      model,
      apiKey,
      message: TITLE_PROBE_MESSAGE,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    titleLogger.debug("titleGeneration.probeCompleted", {
      durationMs: latencyMs,
      hasTitle: Boolean(title),
      modelId: model.modelId,
      providerId: provider.id,
    });
    // Empty title still means the provider accepted the request and returned —
    // connectivity is fine; the model just produced no usable text.
    return { ok: true, latencyMs, title, error: null };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const aborted = controller.signal.aborted;
    const message = aborted
      ? "Request timed out"
      : error instanceof Error
        ? error.message
        : "Unknown error";
    titleLogger.info("titleGeneration.probeFailed", {
      durationMs: latencyMs,
      error: message,
      modelId: model.modelId,
      providerId: provider.id,
    });
    return { ok: false, latencyMs, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function createProviderDefaultModel(
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

export async function buildCompatibleProviderModels(
  agentId: AgentId,
  options: { forceRefresh?: boolean } = {},
) {
  if (agentId === "claude-agent") {
    try {
      return await listClaudeCliProviderModels(undefined, undefined, options);
    } catch (error) {
      providerModelsLogger.warn("claudeCli.catalogProbeFailed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      if (options.forceRefresh) {
        throw error;
      }
      return [];
    }
  }

  if (agentId === "grok-build") {
    return listGrokBuildProviderModels(undefined, options);
  }

  const providers = await listProviderConfigs();
  const savedModels = await listProviderModels();
  const models = await listConfiguredProviderModels(providers, savedModels);
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
      const model = createProviderDefaultModel(agentId, provider);
      return model ? [{ provider, model }] : [];
    });

  const compatibleItems = filterCompatibleProviderModels(agentId, [
    ...modelItems,
    ...providerDefaultItems,
  ]);

  if (agentId === "opencode") {
    return listOpenCodeProviderModels();
  }

  if (agentId === "pi") {
    return compatibleItems;
  }

  if (agentId !== "codex") {
    return compatibleItems;
  }

  const codexModels = await listCodexProviderModels();
  return [...codexModels, ...compatibleItems];
}

async function fetchProviderModels(
  config: ProviderConfigRecord,
): Promise<ProviderListModelsResult> {
  try {
    const piModels = await listCachedPiProviderModels(config, {
      forceRefresh: true,
    });
    if (piModels) {
      const existingModels = await listProviderModels(config.id);
      const enrichedModels = await enrichProviderModelsWithModelsDev(
        config,
        piModels,
        existingModels,
      );
      const models = mergeFetchedProviderModels(enrichedModels, existingModels);

      await saveFetchedProviderModels(config, models);

      return { models, error: null };
    }
  } catch {
    // Fall back to the generic /models endpoint below.
  }

  try {
    const apiKey = await resolveProviderApiKey(config);
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
    const existingModels = await listProviderModels(config.id);
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

    await saveFetchedProviderModels(config, models);

    return { models, error: null };
  } catch (error) {
    return {
      models: await listProviderModels(config.id),
      error:
        error instanceof Error ? error.message : "Unknown model fetch error",
    };
  }
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

// Codex ChatGPT logins in flight: loginId -> promise resolved when the
// browser OAuth roundtrip finishes. The renderer starts a login, opens the
// authUrl externally, then awaits codex:loginWait for the outcome.
const pendingCodexLogins = new Map<string, Promise<CodexLoginOutcome>>();

function registerCodexAccountHandlers() {
  ipcMain.handle("codex:accountRead", async () => readCodexAccount());
  ipcMain.handle("codex:loginStart", async () => {
    let resolveOutcome!: (outcome: CodexLoginOutcome) => void;
    const outcome = new Promise<CodexLoginOutcome>((resolve) => {
      resolveOutcome = resolve;
    });
    const start = await startCodexChatGptLogin((result) =>
      resolveOutcome(result),
    );
    pendingCodexLogins.set(start.loginId, outcome);
    return start;
  });
  ipcMain.handle("codex:loginWait", async (_event, loginId: string) => {
    const outcome = pendingCodexLogins.get(loginId);

    if (!outcome) {
      return { success: false, error: "Unknown login attempt" };
    }

    try {
      return await outcome;
    } finally {
      pendingCodexLogins.delete(loginId);
    }
  });
  ipcMain.handle("codex:loginCancel", async (_event, loginId: string) => {
    await cancelCodexLogin(loginId);
  });
  ipcMain.handle("codex:logout", async () => logoutCodex());
}

export function registerProviderHandlers() {
  registerCodexAccountHandlers();
  ipcMain.handle("provider:listTemplates", async () =>
    listPiProviderTemplates(),
  );
  ipcMain.handle("provider:listConfigs", async () => listProviderConfigs());
  ipcMain.handle(
    "provider:saveConfig",
    async (_event, config: ProviderConfigRecord) => {
      await saveProviderConfig(config);
      return config;
    },
  );
  ipcMain.handle(
    "provider:deleteConfig",
    async (_event, providerId: string) => {
      const config = await getProviderConfig(providerId);
      if (config?.apiKeySecretId) {
        await deleteProviderSecret(config.apiKeySecretId);
      }
      // Cascade: models belong to the config; stale rows would resurface if
      // the same provider id is re-created later.
      await deleteProviderModelsByProvider(providerId);
      await deleteProviderConfig(providerId);
    },
  );
  ipcMain.handle(
    "provider:setApiKey",
    async (_event, providerId: string, apiKey: string) => {
      const secretId = `provider:${providerId}:api-key`;
      await saveProviderSecret(secretId, getEncryptedSecretValue(apiKey));
      await setProviderApiKeySecretId(providerId, secretId);
    },
  );
  ipcMain.handle("provider:clearApiKey", async (_event, providerId: string) => {
    const config = await getProviderConfig(providerId);
    if (config?.apiKeySecretId) {
      await deleteProviderSecret(config.apiKeySecretId);
    }
    await setProviderApiKeySecretId(providerId, null);
  });
  ipcMain.handle("provider:listModels", async (_event, providerId: string) => {
    const config = await getProviderConfig(providerId);
    if (!config) {
      return { models: [], error: "Provider not found" };
    }

    return fetchProviderModels(config);
  });
  ipcMain.handle(
    "provider:saveModel",
    async (_event, model: ProviderModelRecord) => {
      await saveProviderModel(model);
      return model;
    },
  );
  ipcMain.handle(
    "provider:deleteModel",
    async (_event, providerId: string, modelId: string) => {
      await deleteProviderModel(providerId, modelId);
    },
  );
  ipcMain.handle("provider:listAllModels", async () =>
    listConfiguredProviderModels(),
  );
  ipcMain.handle(
    "provider:listCompatibleForAgent",
    async (_event, agentId: AgentId, options?: { forceRefresh?: boolean }) =>
      buildCompatibleProviderModels(agentId, options),
  );
  ipcMain.handle("provider:listDefaults", async () =>
    listAgentProviderDefaults(),
  );
  ipcMain.handle("provider:getDefault", async (_event, agentId: AgentId) =>
    getAgentProviderDefault(agentId),
  );
  ipcMain.handle(
    "provider:setDefault",
    async (_event, agentId: AgentId, providerId: string, modelId: string) => {
      // Built-in (pi) provider models live only in the runtime cache, never in
      // the providerModels table, so validate against the full configured list
      // (persisted + built-in) instead of a DB-only lookup.
      const model = modelId
        ? (await listConfiguredProviderModels()).find(
            (item) =>
              item.providerId === providerId && item.modelId === modelId,
          )
        : null;
      const provider = modelId ? null : await getProviderConfig(providerId);

      if (!model && !provider) {
        throw new Error("Provider model not found");
      }

      const now = new Date().toISOString();
      await saveAgentProviderDefault({
        agentId,
        providerId,
        modelId,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    },
  );
  ipcMain.handle("provider:getTitleModel", async () => getTitleModelSetting());
  ipcMain.handle(
    "provider:setTitleModel",
    async (_event, selection: TitleModelSelection | null) => {
      if (
        selection &&
        (typeof selection.providerId !== "string" ||
          typeof selection.modelId !== "string")
      ) {
        throw new Error("Invalid title model selection");
      }

      await setTitleModelSetting(selection);
    },
  );
  ipcMain.handle(
    "provider:probeTitleModel",
    async (
      _event,
      selection: TitleModelSelection,
    ): Promise<TitleModelProbeResult> => {
      if (
        !selection ||
        typeof selection.providerId !== "string" ||
        typeof selection.modelId !== "string"
      ) {
        throw new Error("Invalid title model selection");
      }

      return probeTitleModel(selection);
    },
  );
  ipcMain.handle("provider:getCommitMessageModel", async () =>
    getCommitMessageModelSetting(),
  );
  ipcMain.handle(
    "provider:setCommitMessageModel",
    async (_event, selection: CommitMessageModelSelection | null) => {
      const hasInvalidRuntimeOption =
        selection &&
        [
          selection.reasoningEffort,
          selection.thinkingLevel,
          selection.serviceTier,
          selection.openCodeAgent,
          selection.openCodeVariant,
        ].some(
          (value) =>
            value !== undefined && value !== null && typeof value !== "string",
        );
      if (
        selection &&
        (typeof selection.agentId !== "string" ||
          typeof selection.providerId !== "string" ||
          typeof selection.modelId !== "string" ||
          hasInvalidRuntimeOption ||
          (selection.fastMode !== undefined &&
            selection.fastMode !== null &&
            typeof selection.fastMode !== "boolean"))
      ) {
        throw new Error("Invalid commit message model selection");
      }

      await setCommitMessageModelSetting(selection);
    },
  );
}
