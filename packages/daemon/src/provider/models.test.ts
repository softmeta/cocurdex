import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listPiBuiltInProviderIdsMock = vi.hoisted(() => vi.fn());
const listPiProviderModelsMock = vi.hoisted(() => vi.fn());
const listPiProviderTemplatesMock = vi.hoisted(() => vi.fn());

vi.mock("@cocurdex/agent-adapters", () => ({
  listPiBuiltInProviderIds: listPiBuiltInProviderIdsMock,
  listPiProviderModels: listPiProviderModelsMock,
  listPiProviderTemplates: listPiProviderTemplatesMock,
}));

import {
  clearBuiltInProviderModelsCache,
  listConfiguredProviderModels,
  saveFetchedProviderModels,
} from "./models";

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

function createState(input: {
  providers: ProviderConfigRecord[];
  models: ProviderModelRecord[];
}) {
  return {
    listProviderConfigs: vi.fn(async () => input.providers),
    listProviderModels: vi.fn(async () => input.models),
    saveProviderModel: vi.fn(async () => {}),
  };
}

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
    const state = createState({ providers: [], models: [] });

    await saveFetchedProviderModels(state, builtInProvider, [model]);

    expect(state.saveProviderModel).not.toHaveBeenCalled();
  });

  it("does not list templates while checking fetched built-in provider models", async () => {
    const state = createState({ providers: [], models: [] });

    await saveFetchedProviderModels(state, builtInProvider, [model]);

    expect(listPiProviderTemplatesMock).not.toHaveBeenCalled();
  });

  it("persists fetched custom provider models", async () => {
    const state = createState({ providers: [], models: [] });

    await saveFetchedProviderModels(state, customProvider, [model]);

    expect(state.saveProviderModel).toHaveBeenCalledWith(model);
  });
});

describe("listConfiguredProviderModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBuiltInProviderModelsCache();
    listPiBuiltInProviderIdsMock.mockReturnValue(["anthropic"]);
    listPiProviderModelsMock.mockResolvedValue([model]);
  });

  it("includes configured built-in provider models without DB persistence", async () => {
    const state = createState({ providers: [builtInProvider], models: [] });

    const models = await listConfiguredProviderModels(state);

    expect(listPiProviderModelsMock).toHaveBeenCalledWith(builtInProvider);
    expect(models).toEqual([model]);
  });

  it("merges DB-backed custom models and built-in model overrides", async () => {
    const customModel = { ...model, providerId: customProvider.id };
    const overriddenBuiltInModel = { ...model, name: "Custom Sonnet label" };
    const state = createState({
      providers: [builtInProvider, customProvider],
      models: [overriddenBuiltInModel, customModel],
    });

    const models = await listConfiguredProviderModels(state);

    expect(models).toEqual([overriddenBuiltInModel, customModel]);
  });

  it("keeps a persisted disabled flag on built-in catalog models", async () => {
    const disabledBuiltInModel = { ...model, enabled: false };
    const state = createState({
      providers: [builtInProvider],
      models: [disabledBuiltInModel],
    });

    const models = await listConfiguredProviderModels(state);

    expect(models).toEqual([disabledBuiltInModel]);
  });

  it("filters the configured list by provider id", async () => {
    const customModel = { ...model, providerId: customProvider.id };
    const state = createState({
      providers: [builtInProvider, customProvider],
      models: [model, customModel],
    });

    const models = await listConfiguredProviderModels(state, {
      providerIds: [customProvider.id],
    });

    expect(listPiProviderModelsMock).not.toHaveBeenCalled();
    expect(models).toEqual([customModel]);
  });

  it("caches configured built-in provider models between reloads", async () => {
    const state = createState({ providers: [builtInProvider], models: [] });

    await listConfiguredProviderModels(state);
    await listConfiguredProviderModels(state);

    expect(listPiProviderModelsMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes configured built-in provider model cache on demand", async () => {
    const refreshedModel = { ...model, modelId: "claude-opus-4-5" };
    listPiProviderModelsMock
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([refreshedModel]);
    const state = createState({ providers: [builtInProvider], models: [] });

    await listConfiguredProviderModels(state);
    const models = await listConfiguredProviderModels(state, {
      forceRefresh: true,
    });

    expect(listPiProviderModelsMock).toHaveBeenCalledTimes(2);
    expect(models).toEqual([refreshedModel]);
  });
});
