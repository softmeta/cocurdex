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
  AgentId,
  AgentProviderSnapshot,
  CodexLoginOutcome,
  CommitMessageModelSelection,
  ProviderAuthLoginUpdate,
  ProviderAuthMethod,
  ProviderAuthPrompt,
  ProviderConfigRecord,
  ProviderModelRecord,
  RefineSessionTitlePayload,
  SessionRecord,
  TitleModelProbeResult,
  TitleModelSelection,
} from "@cocurdex/shared";
import { app, ipcMain } from "electron";
import { chatDaemonOptions } from "../chat";
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
  return requestDaemon(
    "provider.apiKey.set",
    { providerId, apiKey: null },
    await chatDaemonOptions(),
  );
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
  ipcMain.handle(
    "provider:authLoginStart",
    async (_event, providerId: string, method: ProviderAuthMethod) =>
      startProviderAuthLogin(providerId, method),
  );
  ipcMain.handle(
    "provider:authLoginNext",
    async (_event, loginId: string): Promise<ProviderAuthLoginUpdate> => {
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
  ipcMain.handle(
    "provider:authLoginRespond",
    async (_event, loginId: string, promptId: string, value: string) => {
      const login = pendingProviderAuthLogins.get(loginId);
      const prompt = login?.prompts.get(promptId);
      if (!login || !prompt) {
        throw new Error("Login prompt is no longer active");
      }
      login.prompts.delete(promptId);
      prompt.resolve(value);
    },
  );
  ipcMain.handle(
    "provider:authLoginCancel",
    async (_event, loginId: string) => {
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
  ipcMain.handle(
    "provider:saveConfig",
    async (_event, config: ProviderConfigRecord) =>
      requestDaemon(
        "provider.config.save",
        { config },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:deleteConfig", async (_event, providerId: string) =>
    requestDaemon(
      "provider.config.delete",
      { providerId },
      await chatDaemonOptions(),
    ),
  );
  ipcMain.handle(
    "provider:setApiKey",
    async (_event, providerId: string, apiKey: string) =>
      requestDaemon(
        "provider.apiKey.set",
        { providerId, apiKey },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:clearApiKey", async (_event, providerId: string) =>
    requestDaemon(
      "provider.apiKey.set",
      { providerId, apiKey: null },
      await chatDaemonOptions(),
    ),
  );
  ipcMain.handle("provider:listModels", async (_event, providerId: string) =>
    requestDaemon(
      "provider.fetchModels",
      { providerId },
      await chatDaemonOptions(),
    ),
  );
  ipcMain.handle(
    "provider:saveModel",
    async (_event, model: ProviderModelRecord) =>
      requestDaemon(
        "provider.model.save",
        { model },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle(
    "provider:deleteModel",
    async (_event, providerId: string, modelId: string) =>
      requestDaemon(
        "provider.model.delete",
        { providerId, modelId },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:listAllModels", async () =>
    requestDaemon("provider.listAllModels", {}, await chatDaemonOptions()),
  );
  ipcMain.handle(
    "provider:listCompatibleForAgent",
    async (_event, agentId: AgentId, options?: { forceRefresh?: boolean }) =>
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
  ipcMain.handle("provider:getDefault", async (_event, agentId: AgentId) =>
    requestDaemon(
      "provider.default.get",
      { agentId },
      await chatDaemonOptions(),
    ),
  );
  ipcMain.handle(
    "provider:setDefault",
    async (_event, agentId: AgentId, providerId: string, modelId: string) =>
      requestDaemon(
        "provider.default.set",
        { agentId, providerId, modelId },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:getTitleModel", async () =>
    requestDaemon("provider.titleModel.get", await chatDaemonOptions()),
  );
  ipcMain.handle(
    "provider:setTitleModel",
    async (_event, selection: TitleModelSelection | null) =>
      requestDaemon(
        "provider.titleModel.set",
        { selection },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle(
    "provider:probeTitleModel",
    async (
      _event,
      selection: TitleModelSelection,
    ): Promise<TitleModelProbeResult> =>
      requestDaemon(
        "provider.titleModel.probe",
        { selection },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:getCommitMessageModel", async () =>
    requestDaemon("git.commitMessageModel.get", await chatDaemonOptions()),
  );
  ipcMain.handle(
    "provider:setCommitMessageModel",
    async (_event, selection: CommitMessageModelSelection | null) =>
      requestDaemon(
        "git.commitMessageModel.set",
        { selection },
        await chatDaemonOptions(),
      ),
  );
  ipcMain.handle("provider:authRead", async (_event, providerId: string) =>
    requestDaemon(
      "provider.auth.read",
      { providerId },
      await chatDaemonOptions(),
    ),
  );
  ipcMain.handle("provider:authLogout", async (_event, providerId: string) =>
    requestDaemon(
      "provider.auth.logout",
      { providerId },
      await chatDaemonOptions(),
    ),
  );
}
