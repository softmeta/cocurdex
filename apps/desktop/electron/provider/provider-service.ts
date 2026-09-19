import { randomUUID } from "node:crypto";
import {
  cancelCodexLogin,
  generateCodexConversationTitle,
  generatePiConversationTitle,
  loginPiProvider,
  registerBundledPiProviderOAuthFlows,
  startCodexChatGptLogin,
} from "@cocurdex/agent-adapters/desktop-provider";
import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  AgentProviderSnapshot,
  CodexLoginOutcome,
  ProviderAuthLoginUpdate,
  ProviderAuthMethod,
  ProviderAuthPrompt,
  ProviderConfigRecord,
  ProviderModelRecord,
  RefineSessionTitlePayload,
  SessionRecord,
  TitleModelProbeResult,
} from "@cocurdex/shared";
import { app, ipcMain } from "electron";
import { chatDaemonOptions } from "../chat";
import {
  idSchema,
  registerHandler,
  registerHandlerArgs,
  schemas,
} from "../ipc";
import { createLogger } from "../logging";

const titleLogger = createLogger("session-title-provider");

export async function resolveProviderApiKey(
  config: ProviderConfigRecord | null,
) {
  if (!config) return null;
  return requestDaemon(
    "provider.apiKey.read",
    { providerId: config.id },
    await chatDaemonOptions(),
  );
}

async function clearStoredProviderApiKey(providerId: string) {
  try {
    await requestDaemon(
      "provider.apiKey.set",
      { providerId, apiKey: null },
      await chatDaemonOptions(),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Provider not found") {
      return;
    }
    throw error;
  }
}

export async function buildRuntimeProviderConfig(session: SessionRecord) {
  if (session.agentType === "codex") {
    return null;
  }

  const snapshot = session.providerSnapshot;

  if (!snapshot) {
    return null;
  }

  return resolveRuntimeProviderSnapshot(snapshot);
}

export async function resolveRuntimeProviderSnapshot(
  snapshot: AgentProviderSnapshot,
) {
  return requestDaemon(
    "provider.resolveSnapshot",
    { snapshot },
    await chatDaemonOptions(),
  );
}

async function listConfiguredProviderModels(providerId: string) {
  return requestDaemon(
    "provider.listAllModels",
    { providerIds: [providerId] },
    await chatDaemonOptions(),
  );
}

// Cap the title request so a slow or hung provider never blocks the refine
// IPC handler. Title generation is best-effort — on timeout we keep the
// locally derived fallback title. Reasoning models (e.g. deepseek-v4-flash)
// spend several seconds thinking before emitting the title, so keep this
// generous; the refine flow is fire-and-forget and never blocks the UI.
const TITLE_GENERATION_TIMEOUT_MS = 60_000;

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
  const selection = await requestDaemon(
    "provider.titleModel.get",
    await chatDaemonOptions(),
  );
  if (!selection) {
    return null;
  }

  const provider = await requestDaemon(
    "provider.config.get",
    { providerId: selection.providerId },
    await chatDaemonOptions(),
  );
  const model = (await listConfiguredProviderModels(selection.providerId)).find(
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
  const configuredProvider = await requestDaemon(
    "provider.config.get",
    { providerId: runtime.providerId },
    await chatDaemonOptions(),
  );
  const configuredModel = (
    await listConfiguredProviderModels(runtime.providerId)
  ).find(
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

// Codex ChatGPT logins in flight: loginId -> promise resolved when the
// browser OAuth roundtrip finishes. The renderer starts a login, opens the
// authUrl externally, then awaits codex:loginWait for the outcome.
const pendingCodexLogins = new Map<string, Promise<CodexLoginOutcome>>();

interface PendingProviderAuthLogin {
  controller: AbortController;
  prompts: Map<
    string,
    { resolve(value: string): void; reject(error: Error): void }
  >;
  queue: ProviderAuthLoginUpdate[];
  waiters: Array<(update: ProviderAuthLoginUpdate) => void>;
}

const pendingProviderAuthLogins = new Map<string, PendingProviderAuthLogin>();
const PROVIDER_AUTH_LOGIN_RETENTION_MS = 5 * 60 * 1000;

function pushProviderAuthLoginUpdate(
  login: PendingProviderAuthLogin,
  update: ProviderAuthLoginUpdate,
) {
  const waiter = login.waiters.shift();
  if (waiter) {
    waiter(update);
    return;
  }
  login.queue.push(update);
}

function finishProviderAuthLogin(
  loginId: string,
  login: PendingProviderAuthLogin,
  update: ProviderAuthLoginUpdate,
) {
  pushProviderAuthLoginUpdate(login, update);
  const cleanup = setTimeout(() => {
    if (pendingProviderAuthLogins.get(loginId) === login) {
      pendingProviderAuthLogins.delete(loginId);
    }
  }, PROVIDER_AUTH_LOGIN_RETENTION_MS);
  cleanup.unref();
}

function normalizeProviderAuthPrompt(
  promptId: string,
  prompt: Parameters<Parameters<typeof loginPiProvider>[3]["prompt"]>[0],
): ProviderAuthPrompt {
  if (prompt.type === "select") {
    return {
      id: promptId,
      type: "select",
      message: prompt.message,
      options: prompt.options.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description ?? null,
      })),
    };
  }
  return {
    id: promptId,
    type: prompt.type,
    message: prompt.message,
    placeholder: prompt.placeholder ?? null,
  };
}

function startProviderAuthLogin(
  providerId: string,
  method: ProviderAuthMethod,
) {
  const loginId = randomUUID();
  const controller = new AbortController();
  const login: PendingProviderAuthLogin = {
    controller,
    prompts: new Map(),
    queue: [],
    waiters: [],
  };
  pendingProviderAuthLogins.set(loginId, login);

  void loginPiProvider(app.getPath("userData"), providerId, method, {
    signal: controller.signal,
    prompt: (prompt) => {
      const promptId = randomUUID();
      return new Promise<string>((resolve, reject) => {
        const rejectPrompt = () => {
          login.prompts.delete(promptId);
          reject(new Error("Login cancelled"));
          pushProviderAuthLoginUpdate(login, {
            type: "prompt_cancelled",
            promptId,
          });
        };
        if (prompt.signal?.aborted || controller.signal.aborted) {
          rejectPrompt();
          return;
        }
        const abortSignal = prompt.signal ?? controller.signal;
        abortSignal.addEventListener("abort", rejectPrompt, { once: true });
        login.prompts.set(promptId, {
          resolve: (value) => {
            abortSignal.removeEventListener("abort", rejectPrompt);
            resolve(value);
          },
          reject,
        });
        pushProviderAuthLoginUpdate(login, {
          type: "prompt",
          prompt: normalizeProviderAuthPrompt(promptId, prompt),
        });
      });
    },
    notify: (event) => {
      if (event.type === "info" || event.type === "progress") {
        pushProviderAuthLoginUpdate(login, {
          type: event.type,
          message: event.message,
        });
        return;
      }
      if (event.type === "auth_url") {
        pushProviderAuthLoginUpdate(login, {
          type: "auth_url",
          url: event.url,
          instructions: event.instructions ?? null,
        });
        return;
      }
      pushProviderAuthLoginUpdate(login, {
        type: "device_code",
        userCode: event.userCode,
        verificationUri: event.verificationUri,
      });
    },
  })
    .then(async () => {
      await clearStoredProviderApiKey(providerId);
      finishProviderAuthLogin(loginId, login, { type: "complete" });
    })
    .catch((error) => {
      finishProviderAuthLogin(loginId, login, {
        type: "error",
        error: error instanceof Error ? error.message : "Provider login failed",
      });
    });

  return { loginId };
}

function registerProviderAuthHandlers() {
  registerHandlerArgs(
    ipcMain,
    "provider:authLoginStart",
    schemas.providerAuthLoginStart,
    async (_event, providerId, method) =>
      startProviderAuthLogin(providerId, method),
  );
  registerHandler(
    ipcMain,
    "provider:authLoginNext",
    idSchema,
    async (_event, loginId): Promise<ProviderAuthLoginUpdate> => {
      const login = pendingProviderAuthLogins.get(loginId);
      if (!login) {
        return { type: "error", error: "Unknown login attempt" };
      }
      const queued = login.queue.shift();
      if (queued) {
        if (queued.type === "complete" || queued.type === "error") {
          pendingProviderAuthLogins.delete(loginId);
        }
        return queued;
      }
      const update = await new Promise<ProviderAuthLoginUpdate>((resolve) => {
        login.waiters.push(resolve);
      });
      if (update.type === "complete" || update.type === "error") {
        pendingProviderAuthLogins.delete(loginId);
      }
      return update;
    },
  );
  registerHandlerArgs(
    ipcMain,
    "provider:authLoginRespond",
    schemas.providerAuthLoginRespond,
    async (_event, loginId, promptId, value) => {
      const login = pendingProviderAuthLogins.get(loginId);
      const prompt = login?.prompts.get(promptId);
      if (!login || !prompt) {
        throw new Error("Login prompt is no longer active");
      }
      login.prompts.delete(promptId);
      prompt.resolve(value);
    },
  );
  registerHandler(
    ipcMain,
    "provider:authLoginCancel",
    idSchema,
    async (_event, loginId) => {
      const login = pendingProviderAuthLogins.get(loginId);
      if (!login) {
        return;
      }
      login.controller.abort();
      for (const prompt of login.prompts.values()) {
        prompt.reject(new Error("Login cancelled"));
      }
      login.prompts.clear();
      pushProviderAuthLoginUpdate(login, {
        type: "error",
        error: "Login cancelled",
      });
      pendingProviderAuthLogins.delete(loginId);
    },
  );
}

function registerCodexAccountHandlers() {
  ipcMain.handle("codex:accountRead", async () =>
    requestDaemon("codex.account.read", await chatDaemonOptions()),
  );
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
  registerHandler(
    ipcMain,
    "codex:loginWait",
    schemas.codexLoginId,
    async (_event, loginId) => {
      const outcome = pendingCodexLogins.get(loginId);

      if (!outcome) {
        return { success: false, error: "Unknown login attempt" };
      }

      try {
        return await outcome;
      } finally {
        pendingCodexLogins.delete(loginId);
      }
    },
  );
  registerHandler(
    ipcMain,
    "codex:loginCancel",
    schemas.codexLoginId,
    async (_event, loginId) => {
      await cancelCodexLogin(loginId);
    },
  );
  ipcMain.handle("codex:logout", async () =>
    requestDaemon("codex.logout", await chatDaemonOptions()),
  );
}

export function registerProviderHandlers() {
  registerBundledPiProviderOAuthFlows();
  registerCodexAccountHandlers();
  registerProviderAuthHandlers();
  ipcMain.handle("provider:listTemplates", async () =>
    requestDaemon("provider.listTemplates", await chatDaemonOptions()),
  );
  ipcMain.handle("provider:listConfigs", async () =>
    requestDaemon("provider.listConfigs", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "provider:saveConfig",
    schemas.providerConfigSave,
    async (_event, config) =>
      requestDaemon(
        "provider.config.save",
        { config },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:deleteConfig",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.config.delete",
        { providerId },
        await chatDaemonOptions(),
      ),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:setApiKey",
    schemas.providerSetApiKey,
    async (_event, providerId, apiKey) =>
      requestDaemon(
        "provider.apiKey.set",
        { providerId, apiKey },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:clearApiKey",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.apiKey.set",
        { providerId, apiKey: null },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:listModels",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.fetchModels",
        { providerId },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:saveModel",
    schemas.providerModelSave,
    async (_event, model) =>
      requestDaemon(
        "provider.model.save",
        { model },
        await chatDaemonOptions(),
      ),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:deleteModel",
    schemas.providerDeleteModel,
    async (_event, providerId, modelId) =>
      requestDaemon(
        "provider.model.delete",
        { providerId, modelId },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:listAllModels", async () =>
    requestDaemon("provider.listAllModels", {}, await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "agent:login",
    schemas.agentId,
    async (_event, agentId) =>
      requestDaemon("agent.login", { agentId }, await chatDaemonOptions()),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:listCompatibleForAgent",
    schemas.providerCompatibleForAgent,
    async (_event, agentId, options) =>
      requestDaemon(
        "provider.listCompatibleForAgent",
        {
          agentId,
          forceRefresh: options?.forceRefresh,
        },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:listDefaults", async () =>
    requestDaemon("provider.listDefaults", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "provider:getDefault",
    schemas.agentId,
    async (_event, agentId) =>
      requestDaemon(
        "provider.default.get",
        { agentId },
        await chatDaemonOptions(),
      ),
  );
  registerHandlerArgs(
    ipcMain,
    "provider:setDefault",
    schemas.providerSetDefault,
    async (_event, agentId, providerId, modelId) =>
      requestDaemon(
        "provider.default.set",
        { agentId, providerId, modelId },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:getTitleModel", async () =>
    requestDaemon("provider.titleModel.get", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "provider:setTitleModel",
    schemas.providerTitleModelSet,
    async (_event, selection) =>
      requestDaemon(
        "provider.titleModel.set",
        { selection },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:probeTitleModel",
    schemas.providerTitleModelProbe,
    async (_event, selection): Promise<TitleModelProbeResult> =>
      requestDaemon(
        "provider.titleModel.probe",
        { selection },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:getCommitMessageModel", async () =>
    requestDaemon("git.commitMessageModel.get", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "provider:setCommitMessageModel",
    schemas.providerCommitMessageModelSet,
    async (_event, selection) =>
      requestDaemon(
        "git.commitMessageModel.set",
        { selection },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:authRead",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.auth.read",
        { providerId },
        await chatDaemonOptions(),
      ),
  );
  registerHandler(
    ipcMain,
    "provider:authLogout",
    schemas.providerId,
    async (_event, providerId) =>
      requestDaemon(
        "provider.auth.logout",
        { providerId },
        await chatDaemonOptions(),
      ),
  );
}
