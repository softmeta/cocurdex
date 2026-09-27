import type { CompatibleProviderModel } from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getProviderModelCacheVersion,
  probeProviderModelAxes,
  providerModelCache,
  resetNewSessionProviderModelMemoryCacheForTest,
  shouldForceRefreshAdapterCatalog,
  shouldRevalidateProviderModels,
} from "./provider-model-cache";

describe("provider model cache revalidation", () => {
  it("always revalidates the OpenCode catalog while rendering cached models", () => {
    expect(shouldRevalidateProviderModels("opencode", true, false)).toBe(true);
  });

  it("does not repeatedly revalidate an OpenCode catalog verified at runtime", () => {
    expect(shouldRevalidateProviderModels("opencode", true, true)).toBe(false);
  });

  it("revalidates every persisted adapter-owned catalog once per runtime", () => {
    expect(shouldRevalidateProviderModels("codex", true, false)).toBe(true);
    expect(shouldRevalidateProviderModels("grok-build", true, false)).toBe(
      true,
    );
    expect(shouldRevalidateProviderModels("pi", true, false)).toBe(false);
  });

  it("revalidates stale catalogs for every agent", () => {
    expect(shouldRevalidateProviderModels("codex", false, true)).toBe(true);
  });
});

describe("shouldForceRefreshAdapterCatalog", () => {
  it("force-refreshes adapter catalogs only while stale cached models are already shown", () => {
    expect(shouldForceRefreshAdapterCatalog("claude-agent", false)).toBe(false);
    expect(shouldForceRefreshAdapterCatalog("grok-build", true)).toBe(true);
    expect(shouldForceRefreshAdapterCatalog("codex", true)).toBe(true);
    expect(shouldForceRefreshAdapterCatalog("opencode", true)).toBe(true);
    expect(shouldForceRefreshAdapterCatalog("pi", true)).toBe(false);
  });
});

const devinCachedItem = {
  provider: {
    id: "devin",
    name: "Devin",
    baseUrl: "",
    enabled: true,
    apiKeySecretId: null,
    headersJson: null,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  },
  model: {
    providerId: "devin",
    modelId: "claude-opus-5-5-medium",
    name: "Claude Opus 5.5 Medium",
    api: "openai-responses",
    enabled: true,
    source: "api",
    contextLimit: null,
    outputLimit: null,
    supportedReasoningEfforts: [],
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  },
} as CompatibleProviderModel;

const devinAxes = {
  defaultReasoningEffort: "high",
  supportedReasoningEfforts: [
    { reasoningEffort: "medium", description: "Medium", label: "Medium" },
    { reasoningEffort: "high", description: "High", label: "High" },
    { reasoningEffort: "max", description: "Max", label: "Max" },
  ],
  serviceTiers: [{ id: "fast", name: "Fast", description: "" }],
} as const;

describe("probeProviderModelAxes", () => {
  const probeApi = vi.fn();

  beforeEach(() => {
    resetNewSessionProviderModelMemoryCacheForTest();
    probeApi.mockReset().mockResolvedValue(devinAxes);
    Object.defineProperty(window, "desktopApi", {
      configurable: true,
      value: { probeProviderModelAxes: probeApi },
      writable: true,
    });
    providerModelCache.set("devin", {
      result: { defaultSelection: null, items: [devinCachedItem] },
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    delete (window as { desktopApi?: unknown }).desktopApi;
  });

  it("probes the picked model once and merges axes into the cached catalog", async () => {
    const version = getProviderModelCacheVersion();

    probeProviderModelAxes(
      providerModelCache,
      "devin",
      "devin",
      "claude-opus-5-5-medium",
    );
    probeProviderModelAxes(
      providerModelCache,
      "devin",
      "devin",
      "claude-opus-5-5-medium",
    );

    await vi.waitFor(() => {
      expect(
        providerModelCache.get("devin")?.result?.items[0]?.model.serviceTiers,
      ).toEqual(devinAxes.serviceTiers);
    });

    expect(probeApi).toHaveBeenCalledOnce();
    expect(probeApi).toHaveBeenCalledWith("devin", "claude-opus-5-5-medium");
    const model = providerModelCache.get("devin")?.result?.items[0]?.model;
    expect(model?.supportedReasoningEfforts).toEqual(
      devinAxes.supportedReasoningEfforts,
    );
    expect(model?.defaultReasoningEffort).toBe("high");
    expect(model?.reasoning).toBe(true);
    expect(getProviderModelCacheVersion()).toBeGreaterThan(version);
  });

  it("does not probe agents whose catalogs already carry axes", () => {
    probeProviderModelAxes(providerModelCache, "codex", "codex", "gpt-5-codex");

    expect(probeApi).not.toHaveBeenCalled();
  });

  it("retries after a failed probe", async () => {
    probeApi.mockRejectedValueOnce(new Error("daemon offline"));

    probeProviderModelAxes(
      providerModelCache,
      "devin",
      "devin",
      "claude-opus-5-5-medium",
    );
    // A macrotask turn lets the rejection's catch clear the dedupe key.
    await new Promise((resolve) => setTimeout(resolve, 0));

    probeProviderModelAxes(
      providerModelCache,
      "devin",
      "devin",
      "claude-opus-5-5-medium",
    );
    expect(probeApi).toHaveBeenCalledTimes(2);
  });
});
