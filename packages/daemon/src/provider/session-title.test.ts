import type {
  ProviderConfigRecord,
  ProviderModelRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateProviderSessionTitle,
  type SessionTitleDeps,
} from "./session-title";

const generateCodexConversationTitleMock = vi.hoisted(() => vi.fn());
const generatePiConversationTitleMock = vi.hoisted(() => vi.fn());

vi.mock("@cocurdex/agent-adapters", () => ({
  generateCodexConversationTitle: generateCodexConversationTitleMock,
  generatePiConversationTitle: generatePiConversationTitleMock,
  listPiBuiltInProviderIds: () => [],
}));

const now = "2026-01-01T00:00:00.000Z";

const titleProvider = {
  apiKeySecretId: null,
  baseUrl: "https://llm.example/v1",
  createdAt: now,
  enabled: true,
  id: "custom",
  name: "Custom",
  updatedAt: now,
} satisfies ProviderConfigRecord;

const titleModel = {
  api: "openai-completions",
  createdAt: now,
  enabled: true,
  modelId: "title-model",
  name: "Title model",
  providerId: titleProvider.id,
  source: "manual",
  updatedAt: now,
} satisfies ProviderModelRecord;

function session(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    agentType: "codex",
    archivedAt: null,
    sessionModeId: null,
    createdAt: now,
    id: "session-title",
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
    title: "Fallback",
    updatedAt: now,
    workspaceId: "workspace-1",
    writeMode: "native-write",
    ...overrides,
  } as SessionRecord;
}

function deps(withTitleModel: boolean): SessionTitleDeps {
  return {
    state: {
      getAppSetting: async () =>
        withTitleModel
          ? JSON.stringify({
              providerId: titleProvider.id,
              modelId: titleModel.modelId,
            })
          : null,
      getProviderConfig: async (id) =>
        id === titleProvider.id ? titleProvider : null,
      listProviderConfigs: async () => [titleProvider],
      listProviderModels: async () => [titleModel],
    },
    readApiKey: async () => "sk-title",
    resolveSessionProvider: async () => null,
  };
}

const payload = {
  message: "Investigate reconnects",
  fallbackTitle: "Fallback",
};

describe("generateProviderSessionTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the Codex CLI login even when an app title model is configured", async () => {
    generateCodexConversationTitleMock.mockResolvedValue("Codex title");

    const title = await generateProviderSessionTitle(
      deps(true),
      session({}),
      payload,
    );

    expect(generateCodexConversationTitleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: payload.message,
        model: "gpt-5.6-luna",
      }),
    );
    expect(generatePiConversationTitleMock).not.toHaveBeenCalled();
    expect(title).toBe("Codex title");
  });

  it("prefers the dedicated title model for Pi sessions", async () => {
    generatePiConversationTitleMock.mockResolvedValue("Pi title");

    const title = await generateProviderSessionTitle(
      deps(true),
      session({ agentType: "pi" }),
      payload,
    );

    expect(generatePiConversationTitleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-title",
        model: titleModel,
        provider: titleProvider,
      }),
    );
    expect(title).toBe("Pi title");
  });

  it("falls back to the provided title when the model returns nothing", async () => {
    generatePiConversationTitleMock.mockResolvedValue(null);

    await expect(
      generateProviderSessionTitle(
        deps(true),
        session({ agentType: "pi" }),
        payload,
      ),
    ).resolves.toBe("Fallback");
  });

  it("returns null when generation fails", async () => {
    generateCodexConversationTitleMock.mockRejectedValue(
      new Error("Codex is not logged in"),
    );

    await expect(
      generateProviderSessionTitle(deps(false), session({}), payload),
    ).resolves.toBeNull();
  });

  it("leaves other agents to their own runtime", async () => {
    await expect(
      generateProviderSessionTitle(
        deps(true),
        session({ agentType: "claude-agent" }),
        payload,
      ),
    ).resolves.toBeNull();
    expect(generatePiConversationTitleMock).not.toHaveBeenCalled();
    expect(generateCodexConversationTitleMock).not.toHaveBeenCalled();
  });
});
