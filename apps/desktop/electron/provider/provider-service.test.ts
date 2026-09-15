import type {
  ProviderConfigRecord,
  ProviderModelRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateCodexConversationTitleMock = vi.hoisted(() => vi.fn());
const generatePiConversationTitleMock = vi.hoisted(() => vi.fn());
const loginPiProviderMock = vi.hoisted(() => vi.fn());
const registerBundledPiProviderOAuthFlowsMock = vi.hoisted(() => vi.fn());
const requestDaemonMock = vi.hoisted(() => vi.fn());

vi.mock("@cocurdex/daemon/client", () => ({
  requestDaemon: requestDaemonMock,
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/cocurdex-user-data") },
  ipcMain: { handle: vi.fn() },
}));

vi.mock("@cocurdex/agent-adapters/desktop-provider", () => ({
  cancelCodexLogin: vi.fn(),
  generateCodexConversationTitle: generateCodexConversationTitleMock,
  generatePiConversationTitle: generatePiConversationTitleMock,
  loginPiProvider: loginPiProviderMock,
  registerBundledPiProviderOAuthFlows: registerBundledPiProviderOAuthFlowsMock,
  startCodexChatGptLogin: vi.fn(),
}));

vi.mock("../chat", () => ({
  chatDaemonOptions: vi.fn(async () => ({
    userDataPath: "/tmp/cocurdex-user-data",
  })),
}));

vi.mock("../logging", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
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
  });

  it("does not resolve app-managed provider credentials for Codex", async () => {
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
    expect(requestDaemonMock).not.toHaveBeenCalled();
  });
});

describe("generateProviderSessionTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestDaemonMock.mockImplementation(
      async (
        method: string,
        params?: { snapshot?: Record<string, unknown> },
      ) => {
        if (method === "provider.resolveSnapshot") {
          return { ...params?.snapshot, apiKey: null };
        }
        if (method === "provider.titleModel.get") return null;
        return null;
      },
    );
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
    requestDaemonMock.mockImplementation(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === "provider.titleModel.get") {
          return {
            providerId: builtInProvider.id,
            modelId: model.modelId,
          };
        }
        if (method === "provider.config.get") return builtInProvider;
        if (method === "provider.listAllModels") return [model];
        if (method === "provider.apiKey.read") return "sk-test";
        if (method === "provider.resolveSnapshot") {
          return {
            ...(params?.snapshot as Record<string, unknown>),
            apiKey: null,
          };
        }
        return null;
      },
    );
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
    requestDaemonMock.mockImplementation(async (method: string) => {
      if (method === "provider.titleModel.get") {
        return {
          providerId: builtInProvider.id,
          modelId: model.modelId,
        };
      }
      return null;
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
