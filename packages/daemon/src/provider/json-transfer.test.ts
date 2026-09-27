import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import {
  exportConfiguredProviderJson,
  importProviderJson,
} from "./json-transfer";

function createState(seed: {
  providers?: ProviderConfigRecord[];
  models?: ProviderModelRecord[];
}) {
  const providers = new Map(
    (seed.providers ?? []).map((provider) => [provider.id, provider]),
  );
  const models = new Map(
    (seed.models ?? []).map((model) => [
      `${model.providerId}/${model.modelId}`,
      model,
    ]),
  );
  return {
    providers,
    models,
    getProviderConfig: vi.fn(async (id: string) => providers.get(id) ?? null),
    listProviderConfigs: vi.fn(async () => [...providers.values()]),
    listProviderModels: vi.fn(async (providerId?: string) =>
      [...models.values()].filter(
        (model) => !providerId || model.providerId === providerId,
      ),
    ),
    saveProviderConfig: vi.fn(async (config: ProviderConfigRecord) => {
      providers.set(config.id, config);
    }),
    saveProviderModel: vi.fn(async (model: ProviderModelRecord) => {
      models.set(`${model.providerId}/${model.modelId}`, model);
    }),
  };
}

const existingProvider: ProviderConfigRecord = {
  id: "gateway",
  name: "Old name",
  baseUrl: "https://old.test/v1",
  enabled: true,
  apiKeySecretId: "secret-1",
  headersJson: '{"x-old":"1"}',
  compatJson: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const json = JSON.stringify({
  providers: {
    gateway: {
      name: "Gateway",
      baseUrl: "https://gateway.test/v1",
      api: "openai-completions",
      apiKey: "sk-live",
      models: [{ id: "small" }],
    },
    local: {
      baseUrl: "http://localhost:11434/v1",
      api: "openai-completions",
      apiKey: "$OLLAMA_KEY",
      models: [],
    },
  },
});

describe("importProviderJson", () => {
  it("upserts providers while keeping stored secrets and timestamps", async () => {
    const state = createState({ providers: [existingProvider] });
    const setApiKey = vi.fn(async () => {});

    const result = await importProviderJson(state, setApiKey, json);

    expect(result).toEqual({
      providerIds: ["gateway", "local"],
      modelCount: 1,
      warnings: [{ code: "envApiKey", providerId: "local" }],
    });
    expect(state.providers.get("gateway")).toMatchObject({
      name: "Gateway",
      baseUrl: "https://gateway.test/v1",
      apiKeySecretId: "secret-1",
      headersJson: '{"x-old":"1"}',
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    expect(setApiKey).toHaveBeenCalledExactlyOnceWith("gateway", "sk-live");
    expect(state.models.get("gateway/small")).toMatchObject({
      api: "openai-completions",
    });
  });

  it("rejects invalid JSON without writing anything", async () => {
    const state = createState({});

    await expect(
      importProviderJson(state, vi.fn(), '{"providers":{}}'),
    ).rejects.toThrow("No providers found in JSON.");
    expect(state.saveProviderConfig).not.toHaveBeenCalled();
  });
});

describe("exportConfiguredProviderJson", () => {
  it("exports stored providers without credentials", async () => {
    const state = createState({ providers: [existingProvider] });

    const exported = await exportConfiguredProviderJson(state);

    expect(exported).toEqual({
      providers: {
        gateway: {
          name: "Old name",
          baseUrl: "https://old.test/v1",
          headers: { "x-old": "1" },
          models: [],
        },
      },
    });
  });
});
