import type {
  CompatibleProviderModel,
  ProviderConfigRecord,
  ProviderModelRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listPiProviderTemplatesMock = vi.hoisted(() => vi.fn());
const listPiBuiltInProviderIdsMock = vi.hoisted(() => vi.fn());
const listPiProviderModelsMock = vi.hoisted(() => vi.fn());
const listClaudeCliProviderModelsMock = vi.hoisted(() => vi.fn());
const listOpenCodeProviderModelsMock = vi.hoisted(() => vi.fn());
const listGrokBuildProviderModelsMock = vi.hoisted(() => vi.fn());
const generateCodexConversationTitleMock = vi.hoisted(() => vi.fn());
const generatePiConversationTitleMock = vi.hoisted(() => vi.fn());
const resolvePiProviderAuthMock = vi.hoisted(() => vi.fn());
const readPiProviderAuthStateMock = vi.hoisted(() => vi.fn());
const loginPiProviderMock = vi.hoisted(() => vi.fn());
const logoutPiProviderMock = vi.hoisted(() => vi.fn());
const registerBundledPiProviderOAuthFlowsMock = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/cocurdex-user-data") },
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    decryptString: vi.fn(),
    encryptString: vi.fn(),
    isEncryptionAvailable: vi.fn(() => false),
  },
}));

vi.mock("@cocurdex/agent-adapters/desktop-provider", () => ({
  generateCodexConversationTitle: generateCodexConversationTitleMock,
  generatePiConversationTitle: generatePiConversationTitleMock,
  listClaudeCliProviderModels: listClaudeCliProviderModelsMock,
  listCodexProviderModels: vi.fn(),
  listGrokBuildProviderModels: listGrokBuildProviderModelsMock,
  listOpenCodeProviderModels: listOpenCodeProviderModelsMock,
  listPiBuiltInProviderIds: listPiBuiltInProviderIdsMock,
  listPiProviderModels: listPiProviderModelsMock,
  listPiProviderTemplates: listPiProviderTemplatesMock,
  loginPiProvider: loginPiProviderMock,
  logoutPiProvider: logoutPiProviderMock,
  readPiProviderAuthState: readPiProviderAuthStateMock,
  registerBundledPiProviderOAuthFlows: registerBundledPiProviderOAuthFlowsMock,
  resolvePiProviderAuth: resolvePiProviderAuthMock,
}));

vi.mock("../chat", () => ({
  deleteProviderConfig: vi.fn(),
  deleteProviderModel: vi.fn(),
  deleteProviderSecret: vi.fn(),
  getAgentProviderDefault: vi.fn(),
  getTitleModelSetting: vi.fn(),
  getProviderConfig: vi.fn(),
  getProviderModel: vi.fn(),
  getProviderSecret: vi.fn(),
  listAgentProviderDefaults: vi.fn(),
  listProviderConfigs: vi.fn(),
  listProviderModels: vi.fn(),
  saveAgentProviderDefault: vi.fn(),
  saveProviderConfig: vi.fn(),
  saveProviderModel: vi.fn(),
  saveProviderSecret: vi.fn(),
  setProviderApiKeySecretId: vi.fn(),
}));

vi.mock("../logging", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("./models-dev-metadata", () => ({
  enrichProviderModelsWithModelsDev: vi.fn(),
}));

const builtInProvider = {
  apiKeySecretId: "secret",
  baseUrl: "https://api.anthropic.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  enabled: true,
  headersJson: null,
  id: "anthropic",
  name: "Anthropic",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies ProviderConfigRecord;

const customProvider = {
  ...builtInProvider,
  baseUrl: "https://api.example.com/v1",
  id: "custom",
  name: "Custom",
} satisfies ProviderConfigRecord;

const model = {
  createdAt: "2026-01-01T00:00:00.000Z",
  enabled: true,
  modelId: "claude-sonnet-4-5",
  name: "Claude Sonnet 4.5",
  providerId: builtInProvider.id,
  api: "anthropic-messages",
  source: "api",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies ProviderModelRecord;

const codexSession = {
  agentType: "codex",
  archivedAt: null,
  collaborationMode: "default",
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "session-codex-title",
  lastMessageAt: null,
  permissionMode: "codex-read-only",
  providerSnapshot: {
    api: "openai-responses",
    baseUrl: "",
    modelId: "gpt-5.6-luna",
    modelName: "GPT-5.6 Luna",
    providerId: "codex",
    providerName: "Codex",
  },
  status: "idle",
  title: "Investigate reconnect failures after restarting the session",
  updatedAt: "2026-01-01T00:00:00.000Z",
  workspaceId: "workspace-1",
  writeMode: "native-write",
} satisfies SessionRecord;

describe("registerProviderHandlers", () => {
  it("registers statically bundled Pi OAuth flows for Electron", async () => {
    const { registerProviderHandlers } = await import("./provider-service");

    registerProviderHandlers();

    expect(registerBundledPiProviderOAuthFlowsMock).toHaveBeenCalledOnce();
  });
});

describe("buildRuntimeProviderConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePiProviderAuthMock.mockResolvedValue(undefined);
  });

  it("does not resolve app-managed provider credentials for Codex", async () => {
    const { getProviderConfig } = await import("../chat");
    const { buildRuntimeProviderConfig } = await import("./provider-service");

    const runtime = await buildRuntimeProviderConfig({
      ...codexSession,
      providerSnapshot: {
        ...codexSession.providerSnapshot,
        baseUrl: "https://example.invalid/v1",
        providerId: "custom-openai",
        providerName: "Custom OpenAI",
      },
    });

    expect(runtime).toBeNull();
    expect(getProviderConfig).not.toHaveBeenCalled();
  });

  it("injects Pi OAuth request auth into every runtime provider config", async () => {
    const { getProviderConfig } = await import("../chat");
    vi.mocked(getProviderConfig).mockResolvedValue(builtInProvider);
    listPiBuiltInProviderIdsMock.mockReturnValue([builtInProvider.id]);
    resolvePiProviderAuthMock.mockResolvedValue({
      auth: {
        apiKey: "oauth-access-token",
        baseUrl: "https://oauth.example.com",
        headers: { "x-oauth-account": "account-1" },
      },
      source: "OAuth",
    });
    const { buildRuntimeProviderConfig } = await import("./provider-service");

    const runtime = await buildRuntimeProviderConfig({
      ...codexSession,
      agentType: "pi",
      providerSnapshot: {
        ...codexSession.providerSnapshot,
        api: "anthropic-messages",
        baseUrl: builtInProvider.baseUrl,
        headersJson: JSON.stringify({ "x-existing": "yes" }),
        modelId: model.modelId,
        modelName: model.name,
        providerId: builtInProvider.id,
        providerName: builtInProvider.name,
      },
    });

    expect(runtime).toEqual(
      expect.objectContaining({
        apiKey: "oauth-access-token",
        baseUrl: "https://oauth.example.com",
        headersJson: JSON.stringify({
          "x-existing": "yes",
          "x-oauth-account": "account-1",
        }),
      }),
    );
  });
});

const claudeSession = {
  agentType: "claude-agent",
  archivedAt: null,
  collaborationMode: "default",
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "session-claude-title",
  lastMessageAt: null,
  permissionMode: "claude-default",
  providerSnapshot: {
    api: "anthropic-messages",
    baseUrl: "",
    modelId: "sonnet",
    modelName: "Sonnet",
    providerId: "claude-agent",
    providerName: "Claude Agent",
  },
  status: "idle",
  title: "我想再接入一个历史汇总的 tab",
  updatedAt: "2026-01-01T00:00:00.000Z",
  workspaceId: "workspace-1",
  writeMode: "native-write",
} satisfies SessionRecord;

describe("generateProviderSessionTitle", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getProviderConfig, getTitleModelSetting } = await import("../chat");
    vi.mocked(getProviderConfig).mockResolvedValue(null);
    vi.mocked(getTitleModelSetting).mockResolvedValue(null);
  });

  it("uses the Codex CLI login when the session has no API-backed title model", async () => {
    generateCodexConversationTitleMock.mockResolvedValue(
      "Investigate session reconnect failures",
    );
    const { generateProviderSessionTitle } = await import("./provider-service");

    const title = await generateProviderSessionTitle(codexSession, {
      fallbackTitle: codexSession.title,
      message:
        "Please investigate reconnect failures after restarting the session.",
    });

    expect(generateCodexConversationTitleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          "Please investigate reconnect failures after restarting the session.",
        model: "gpt-5.6-luna",
      }),
    );
    expect(generatePiConversationTitleMock).not.toHaveBeenCalled();
    expect(title).toBe("Investigate session reconnect failures");
  });

  it("does not let the app title model override the Codex adapter strategy", async () => {
    const {
      getProviderConfig,
      getTitleModelSetting,
      listProviderConfigs,
      listProviderModels,
    } = await import("../chat");
    vi.mocked(getTitleModelSetting).mockResolvedValue({
      providerId: builtInProvider.id,
      modelId: model.modelId,
    });
    vi.mocked(getProviderConfig).mockResolvedValue(builtInProvider);
    vi.mocked(listProviderConfigs).mockResolvedValue([builtInProvider]);
    vi.mocked(listProviderModels).mockResolvedValue([model]);
    listPiBuiltInProviderIdsMock.mockReturnValue([]);
    generateCodexConversationTitleMock.mockResolvedValue(
      "Investigate session reconnect failures",
    );
    generatePiConversationTitleMock.mockResolvedValue("Wrong title backend");
    const { generateProviderSessionTitle } = await import("./provider-service");

    const title = await generateProviderSessionTitle(codexSession, {
      fallbackTitle: codexSession.title,
      message: "Please investigate reconnect failures.",
    });

    expect(generateCodexConversationTitleMock).toHaveBeenCalledOnce();
    expect(generatePiConversationTitleMock).not.toHaveBeenCalled();
    expect(title).toBe("Investigate session reconnect failures");
  });

  it("leaves Claude title generation to the session runtime", async () => {
    const { getTitleModelSetting } = await import("../chat");
    vi.mocked(getTitleModelSetting).mockResolvedValue({
      providerId: builtInProvider.id,
      modelId: model.modelId,
    });
    generatePiConversationTitleMock.mockResolvedValue("Wrong title backend");
    const { generateProviderSessionTitle } = await import("./provider-service");

    const title = await generateProviderSessionTitle(claudeSession, {
      fallbackTitle: claudeSession.title,
      message:
        "我想再接入一个历史汇总的 tab，也就是说从我这个应用发布到现在为止。",
    });

    expect(generateCodexConversationTitleMock).not.toHaveBeenCalled();
    expect(generatePiConversationTitleMock).not.toHaveBeenCalled();
    expect(title).toBeNull();
  });

  it("keeps the fallback title when Codex CLI generation fails", async () => {
    generateCodexConversationTitleMock.mockRejectedValue(
      new Error("Codex is not logged in"),
    );
    const { generateProviderSessionTitle } = await import("./provider-service");

    const title = await generateProviderSessionTitle(codexSession, {
      fallbackTitle: codexSession.title,
      message: "Please investigate reconnect failures.",
    });

    expect(title).toBeNull();
  });
});

describe("saveFetchedProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPiBuiltInProviderIdsMock.mockReturnValue(["anthropic"]);
    listPiProviderTemplatesMock.mockReturnValue([
      {
        api: "anthropic-messages",
        baseUrl: "https://api.anthropic.com",
        id: "anthropic",
        name: "Anthropic",
      },
    ]);
    listPiProviderModelsMock.mockResolvedValue([model]);
  });

  it("skips DB persistence for fetched built-in provider models", async () => {
    const saveModel = vi.fn();
    const { saveFetchedProviderModels } = await import("./provider-service");

    await saveFetchedProviderModels(builtInProvider, [model], saveModel);

    expect(saveModel).not.toHaveBeenCalled();
  });

  it("does not list templates while checking fetched built-in provider models", async () => {
    const saveModel = vi.fn();
    const { saveFetchedProviderModels } = await import("./provider-service");

    await saveFetchedProviderModels(builtInProvider, [model], saveModel);

    expect(listPiProviderTemplatesMock).not.toHaveBeenCalled();
  });

  it("persists fetched custom provider models", async () => {
    const saveModel = vi.fn();
    const { saveFetchedProviderModels } = await import("./provider-service");

    await saveFetchedProviderModels(customProvider, [model], saveModel);

    expect(saveModel).toHaveBeenCalledWith(model);
  });
});

describe("listConfiguredProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPiBuiltInProviderIdsMock.mockReturnValue(["anthropic"]);
    listPiProviderModelsMock.mockResolvedValue([model]);
  });

  it("includes configured built-in provider models without DB persistence", async () => {
    const { clearBuiltInProviderModelsCache, listConfiguredProviderModels } =
      await import("./provider-service");
    clearBuiltInProviderModelsCache();

    const models = await listConfiguredProviderModels([builtInProvider], []);

    expect(listPiProviderModelsMock).toHaveBeenCalledWith(builtInProvider);
    expect(models).toEqual([model]);
  });

  it("merges DB-backed custom models and built-in model overrides", async () => {
    const customModel = { ...model, providerId: customProvider.id };
    const overriddenBuiltInModel = { ...model, name: "Custom Sonnet label" };
    const { clearBuiltInProviderModelsCache, listConfiguredProviderModels } =
      await import("./provider-service");
    clearBuiltInProviderModelsCache();

    const models = await listConfiguredProviderModels(
      [builtInProvider, customProvider],
      [overriddenBuiltInModel, customModel],
    );

    expect(models).toEqual([overriddenBuiltInModel, customModel]);
  });

  it("caches configured built-in provider models between reloads", async () => {
    const { clearBuiltInProviderModelsCache, listConfiguredProviderModels } =
      await import("./provider-service");
    clearBuiltInProviderModelsCache();

    await listConfiguredProviderModels([builtInProvider], []);
    await listConfiguredProviderModels([builtInProvider], []);

    expect(listPiProviderModelsMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes configured built-in provider model cache on demand", async () => {
    const refreshedModel = { ...model, modelId: "claude-opus-4-5" };
    listPiProviderModelsMock
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([refreshedModel]);
    const { clearBuiltInProviderModelsCache, listConfiguredProviderModels } =
      await import("./provider-service");
    clearBuiltInProviderModelsCache();

    await listConfiguredProviderModels([builtInProvider], []);
    const models = await listConfiguredProviderModels([builtInProvider], [], {
      forceRefresh: true,
    });

    expect(listPiProviderModelsMock).toHaveBeenCalledTimes(2);
    expect(models).toEqual([refreshedModel]);
  });
});

describe("buildCompatibleProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPiBuiltInProviderIdsMock.mockReturnValue(["opencode-go"]);
    listPiProviderTemplatesMock.mockReturnValue([]);
    listPiProviderModelsMock.mockResolvedValue([
      {
        ...model,
        api: "openai-completions",
        modelId: "kimi-k2.5",
        name: "Kimi K2.5",
        providerId: "opencode-go",
      },
    ]);
    listGrokBuildProviderModelsMock.mockResolvedValue([]);
    listClaudeCliProviderModelsMock.mockResolvedValue([]);
    listOpenCodeProviderModelsMock.mockResolvedValue([]);
  });

  it("includes configured built-in providers that are not templates", async () => {
    const { listProviderConfigs, listProviderModels } = await import("../chat");
    vi.mocked(listProviderConfigs).mockResolvedValue([
      {
        ...builtInProvider,
        baseUrl: "https://opencode.ai/zen/go/v1",
        id: "opencode-go",
        name: "OpenCode Go",
      },
    ]);
    vi.mocked(listProviderModels).mockResolvedValue([]);
    const { buildCompatibleProviderModels, clearBuiltInProviderModelsCache } =
      await import("./provider-service");
    clearBuiltInProviderModelsCache();

    const models = await buildCompatibleProviderModels("pi");

    expect(listPiProviderTemplatesMock).not.toHaveBeenCalled();
    expect(models.map(({ model }) => model.modelId)).toContain("kimi-k2.5");
  });

  it("loads Grok Build models from the Grok Build runtime catalog", async () => {
    const grokBuildModels = [
      {
        provider: {
          ...builtInProvider,
          baseUrl: "",
          id: "grok-build",
          name: "Grok Build",
        },
        model: {
          ...model,
          api: "openai-responses",
          modelId: "grok-4.5",
          name: "Grok 4.5",
          providerId: "grok-build",
        },
      },
    ] satisfies CompatibleProviderModel[];
    listGrokBuildProviderModelsMock.mockResolvedValue(grokBuildModels);
    const { listProviderConfigs, listProviderModels } = await import("../chat");
    vi.mocked(listProviderConfigs).mockResolvedValue([]);
    vi.mocked(listProviderModels).mockResolvedValue([]);
    const { buildCompatibleProviderModels } = await import(
      "./provider-service"
    );

    const models = await buildCompatibleProviderModels("grok-build");

    expect(listGrokBuildProviderModelsMock).toHaveBeenCalledOnce();
    expect(models).toEqual(grokBuildModels);
  });

  it("forwards forced refreshes to adapter-owned catalogs", async () => {
    const { buildCompatibleProviderModels } = await import(
      "./provider-service"
    );

    await buildCompatibleProviderModels("grok-build", { forceRefresh: true });

    expect(listGrokBuildProviderModelsMock).toHaveBeenCalledWith(undefined, {
      forceRefresh: true,
    });
  });

  it("loads Claude Agent models from the user's Claude runtime", async () => {
    const claudeCliModels = [
      {
        provider: {
          ...builtInProvider,
          baseUrl: "",
          id: "claude-agent",
          name: "Claude Agent",
        },
        model: {
          ...model,
          modelId: "sonnet",
          name: "Sonnet",
          providerId: "claude-agent",
        },
      },
    ] satisfies CompatibleProviderModel[];
    listClaudeCliProviderModelsMock.mockResolvedValue(claudeCliModels);
    const { buildCompatibleProviderModels } = await import(
      "./provider-service"
    );

    const models = await buildCompatibleProviderModels("claude-agent");

    expect(listClaudeCliProviderModelsMock).toHaveBeenCalledOnce();
    expect(models).toEqual(claudeCliModels);
  });
});
