import type { AgentId, CompatibleProviderModel } from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultProviderModelValue } from "@/features/sessions/provider-model/default-provider-model";
import {
  clearNewSessionProviderModelCacheForTest,
  getCachedProviderModelEntry,
  loadProviderModelOptions,
  providerModelCache,
  resetNewSessionProviderModelMemoryCacheForTest,
  subscribeProviderModelCache,
  updateCachedProviderDefault,
} from "@/features/sessions/provider-model/provider-model-cache";

const desktopApiMock = vi.hoisted(() => ({
  getAgentProviderDefault: vi.fn(),
  listCompatibleProvidersForAgent: vi.fn(),
}));

vi.mock("../../lib/ipc", () => ({
  desktopApi: desktopApiMock,
}));

const PI_AGENT: AgentId = "pi";
const CODEX_AGENT: AgentId = "codex";
const GROK_AGENT: AgentId = "grok-build";

const piItems: CompatibleProviderModel[] = [
  {
    provider: {
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      headersJson: null,
    },
    model: {
      modelId: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      api: "openai-completions",
    },
  },
  {
    provider: {
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      headersJson: null,
    },
    model: {
      modelId: "kimi-k2.6",
      name: "Kimi K2.6",
      api: "openai-completions",
    },
  },
] as unknown as CompatibleProviderModel[];

describe("loadProviderModelOptions", () => {
  beforeEach(() => {
    clearNewSessionProviderModelCacheForTest();
    resetNewSessionProviderModelMemoryCacheForTest();
    desktopApiMock.getAgentProviderDefault.mockReset();
    desktopApiMock.listCompatibleProvidersForAgent.mockReset();
    desktopApiMock.listCompatibleProvidersForAgent.mockResolvedValue(piItems);
  });

  it("keeps the cached selection when the store has no default", async () => {
    desktopApiMock.getAgentProviderDefault.mockResolvedValue(null);

    const cache = new Map();
    // Seed the cache as a prior selection would (kimi picked last session).
    cache.set(PI_AGENT, {
      result: { defaultSelection: null, items: piItems },
      updatedAt: Date.now(),
    });
    updateCachedProviderDefault(cache, PI_AGENT, "openrouter", "kimi-k2.6");

    const result = await loadProviderModelOptions(cache, PI_AGENT);

    expect(result.defaultSelection).toMatchObject({
      providerId: "openrouter",
      modelId: "kimi-k2.6",
    });
  });

  it("uses the store default when present", async () => {
    desktopApiMock.getAgentProviderDefault.mockResolvedValue({
      agentId: PI_AGENT,
      providerId: "openrouter",
      modelId: "deepseek-v4-flash",
      isDefault: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const cache = new Map();
    cache.set(PI_AGENT, {
      result: { defaultSelection: null, items: piItems },
      updatedAt: Date.now(),
    });
    updateCachedProviderDefault(cache, PI_AGENT, "openrouter", "kimi-k2.6");

    const result = await loadProviderModelOptions(cache, PI_AGENT);

    expect(result.defaultSelection).toMatchObject({
      modelId: "deepseek-v4-flash",
    });
  });

  it("keeps Codex models on the adapter-owned catalog", async () => {
    desktopApiMock.getAgentProviderDefault.mockResolvedValue({
      agentId: CODEX_AGENT,
      providerId: "openrouter",
      modelId: "third-party-model",
      isDefault: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    desktopApiMock.listCompatibleProvidersForAgent.mockResolvedValue([
      {
        provider: {
          id: "codex",
          name: "Codex",
          baseUrl: "",
          headersJson: null,
        },
        model: {
          modelId: "gpt-5.5",
          name: "GPT-5.5",
          api: "openai-responses",
        },
      },
      piItems[0],
    ]);

    const result = await loadProviderModelOptions(new Map(), CODEX_AGENT);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.provider.id).toBe("codex");
    expect(result.defaultSelection).toBeNull();
  });

  it("prefers the adapter preference when both selections are configured", () => {
    const value = getDefaultProviderModelValue(
      PI_AGENT,
      piItems,
      {
        agentId: PI_AGENT,
        providerId: "openrouter",
        modelId: "deepseek-v4-flash",
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      { providerId: "openrouter", modelId: "kimi-k2.6" },
    );

    expect(value).toBe("openrouter::kimi-k2.6");
  });

  it("persists the Grok catalog for active-session recovery", async () => {
    const grokItems = [
      {
        provider: {
          id: GROK_AGENT,
          name: "Grok Build",
        },
        model: {
          modelId: "grok-4.5",
          name: "Grok 4.5",
          api: "openai-responses",
        },
      },
    ] as unknown as CompatibleProviderModel[];
    desktopApiMock.listCompatibleProvidersForAgent.mockResolvedValue(grokItems);
    desktopApiMock.getAgentProviderDefault.mockResolvedValue(null);

    await loadProviderModelOptions(providerModelCache, GROK_AGENT);
    resetNewSessionProviderModelMemoryCacheForTest();

    expect(
      getCachedProviderModelEntry(providerModelCache, GROK_AGENT)?.result
        ?.items,
    ).toEqual(grokItems);
  });

  it("force refreshes adapter-owned catalogs during revalidation", async () => {
    desktopApiMock.getAgentProviderDefault.mockResolvedValue(null);

    await loadProviderModelOptions(new Map(), GROK_AGENT);

    expect(desktopApiMock.listCompatibleProvidersForAgent).toHaveBeenCalledWith(
      GROK_AGENT,
      { forceRefresh: true },
    );
  });

  it("notifies active-session consumers after catalog loading", async () => {
    let notificationCount = 0;
    const unsubscribe = subscribeProviderModelCache(() => {
      notificationCount += 1;
    });

    try {
      desktopApiMock.getAgentProviderDefault.mockResolvedValue(null);
      await loadProviderModelOptions(new Map(), PI_AGENT);
    } finally {
      unsubscribe();
    }

    expect(notificationCount).toBe(1);
  });
});
