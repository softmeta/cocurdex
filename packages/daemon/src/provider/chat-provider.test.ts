import type {
  AgentProviderSnapshot,
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  type ProviderModelState,
  resolveChatProvider,
  resolveTitleChatProvider,
} from "./chat-provider";

const now = "2026-01-01T00:00:00.000Z";

function provider(overrides: Partial<ProviderConfigRecord> = {}) {
  return {
    id: "custom",
    name: "Custom",
    baseUrl: "https://llm.example/v1",
    enabled: true,
    apiKeySecretId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } satisfies ProviderConfigRecord;
}

function model(overrides: Partial<ProviderModelRecord> = {}) {
  return {
    providerId: "custom",
    modelId: "chat-model",
    name: "Chat model",
    api: "openai-completions",
    enabled: true,
    source: "manual",
    capabilities: ["chat"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } satisfies ProviderModelRecord;
}

function state(
  providers: ProviderConfigRecord[],
  models: ProviderModelRecord[],
  titleModel: string | null = null,
): ProviderModelState {
  return {
    getAppSetting: async () => titleModel,
    getProviderConfig: async (id) =>
      providers.find((item) => item.id === id) ?? null,
    listProviderConfigs: async () => providers,
    listProviderModels: async () => models,
  };
}

const withKey = async (snapshot: AgentProviderSnapshot) => ({
  ...snapshot,
  apiKey: "key",
});

describe("resolveChatProvider", () => {
  it("resolves an enabled chat model into a runtime config", async () => {
    await expect(
      resolveChatProvider(
        state([provider()], [model()]),
        withKey,
        "custom",
        "chat-model",
      ),
    ).resolves.toMatchObject({
      providerId: "custom",
      modelId: "chat-model",
      baseUrl: "https://llm.example/v1",
      apiKey: "key",
    });
  });

  it("rejects a disabled provider", async () => {
    await expect(
      resolveChatProvider(
        state([provider({ enabled: false })], [model()]),
        withKey,
        "custom",
        "chat-model",
      ),
    ).rejects.toThrow("Provider is unavailable or disabled");
  });

  it("rejects a model that cannot chat", async () => {
    await expect(
      resolveChatProvider(
        state([provider()], [model({ enabled: false })]),
        withKey,
        "custom",
        "chat-model",
      ),
    ).rejects.toThrow("unavailable for chat");
  });
});

describe("resolveTitleChatProvider", () => {
  it("returns null instead of failing when the title model is gone", async () => {
    const selection = JSON.stringify({ providerId: "gone", modelId: "x" });
    await expect(
      resolveTitleChatProvider(
        state([provider()], [model()], selection),
        withKey,
      ),
    ).resolves.toBeNull();
  });
});
