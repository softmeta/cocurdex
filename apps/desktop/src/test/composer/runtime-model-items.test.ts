import type {
  AgentId,
  AgentProviderSnapshot,
  CompatibleProviderModel,
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { CODEX_BUILT_IN_PROVIDER_ID } from "@cocurdex/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { usesAdapterOwnedModelCatalog } from "@/features/sessions/provider-model/adapter-owned-catalog";
import {
  clearNewSessionProviderModelCacheForTest,
  providerModelCache,
  resetNewSessionProviderModelMemoryCacheForTest,
} from "@/features/sessions/provider-model/provider-model-cache";
import { getRuntimeModelItems } from "@/features/sessions/provider-model/runtime-model-items";

const now = "2026-05-10T00:00:00.000Z";

const grokSnapshot = {
  providerId: "grok-build",
  providerName: "Grok Build",
  modelId: "grok-4.5",
  modelName: "Grok 4.5",
  api: "openai-responses",
  baseUrl: "",
} as AgentProviderSnapshot;

const globalProvider = {
  id: "openrouter",
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  enabled: true,
  apiKeySecretId: null,
  headersJson: null,
  createdAt: now,
  updatedAt: now,
} as ProviderConfigRecord;

const globalModel = {
  providerId: "openrouter",
  modelId: "deepseek/deepseek-v4-flash",
  name: "DeepSeek V4 Flash",
  api: "openai-completions",
  enabled: true,
  source: "manual",
  contextLimit: null,
  outputLimit: null,
  createdAt: now,
  updatedAt: now,
} as ProviderModelRecord;

function makeCachedItem(
  providerId: string,
  providerName: string,
  modelId: string,
  modelName: string,
  api: CompatibleProviderModel["model"]["api"] = "openai-completions",
): CompatibleProviderModel {
  return {
    provider: {
      id: providerId,
      name: providerName,
      baseUrl: "",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    },
    model: {
      providerId,
      modelId,
      name: modelName,
      api,
      enabled: true,
      source: "manual",
      contextLimit: null,
      outputLimit: null,
      createdAt: now,
      updatedAt: now,
    },
  } as CompatibleProviderModel;
}

const grokCachedItem = makeCachedItem(
  "grok-build",
  "Grok Build",
  "grok-4.5",
  "Grok 4.5",
  "openai-responses",
);

describe("usesAdapterOwnedModelCatalog", () => {
  it.each([
    ["claude-agent", true],
    ["codex", true],
    ["grok-build", true],
    ["opencode", true],
    ["pi", false],
  ] as const)("%s is adapter-owned=%s", (agentId: AgentId, expected) => {
    expect(usesAdapterOwnedModelCatalog(agentId)).toBe(expected);
  });
});

describe("getRuntimeModelItems", () => {
  beforeEach(() => {
    clearNewSessionProviderModelCacheForTest();
    resetNewSessionProviderModelMemoryCacheForTest();
  });

  it("keeps Grok snapshot models even though the agent has no app-managed APIs", () => {
    const items = getRuntimeModelItems(
      "grok-build",
      [] as ProviderModelRecord[],
      [] as ProviderConfigRecord[],
      grokSnapshot,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.model.modelId).toBe("grok-4.5");
    expect(items[0]?.model.name).toBe("Grok 4.5");
  });

  it("surfaces the Grok adapter catalog from cache for active sessions", () => {
    providerModelCache.set("grok-build", {
      result: {
        defaultSelection: null,
        items: [grokCachedItem],
      },
      updatedAt: Date.now(),
    });

    const items = getRuntimeModelItems(
      "grok-build",
      [] as ProviderModelRecord[],
      [] as ProviderConfigRecord[],
      null,
    );

    expect(items).toEqual([grokCachedItem]);
  });

  it.each([
    "grok-build",
    "claude-agent",
    "opencode",
    "codex",
  ] as const)("does not mix global provider-table models into the %s catalog", (agentId) => {
    const cachedItem = makeCachedItem(
      agentId === "codex" ? CODEX_BUILT_IN_PROVIDER_ID : agentId,
      agentId,
      `${agentId}-model`,
      `${agentId} model`,
      agentId === "claude-agent" ? "anthropic-messages" : "openai-responses",
    );
    providerModelCache.set(agentId, {
      result: {
        defaultSelection: null,
        items: [cachedItem],
      },
      updatedAt: Date.now(),
    });

    const items = getRuntimeModelItems(
      agentId,
      [globalModel],
      [globalProvider],
      null,
    );

    expect(items).toEqual([cachedItem]);
    expect(items.some((item) => item.model.name === "DeepSeek V4 Flash")).toBe(
      false,
    );
  });

  it("keeps Claude Agent snapshot models without app-managed API filtering", () => {
    const items = getRuntimeModelItems(
      "claude-agent",
      [] as ProviderModelRecord[],
      [] as ProviderConfigRecord[],
      {
        providerId: "claude-agent",
        providerName: "Claude Agent",
        modelId: "claude-opus-4-6",
        modelName: "Opus 4.6",
        api: "anthropic-messages",
        baseUrl: "",
      } as AgentProviderSnapshot,
    );

    expect(items.map((item) => item.model.modelId)).toEqual([
      "claude-opus-4-6",
    ]);
  });

  it("keeps only Codex built-in rows from cache (sanitize) and skips the global table", () => {
    const builtIn = makeCachedItem(
      CODEX_BUILT_IN_PROVIDER_ID,
      "Codex",
      "gpt-5.3-codex",
      "gpt-5.3-codex",
      "openai-responses",
    );
    const thirdParty = makeCachedItem(
      "openrouter",
      "OpenRouter",
      "openai/gpt-5",
      "GPT-5",
      "openai-responses",
    );
    providerModelCache.set("codex", {
      result: {
        defaultSelection: null,
        items: [builtIn, thirdParty],
      },
      updatedAt: Date.now(),
    });

    const items = getRuntimeModelItems(
      "codex",
      [globalModel],
      [globalProvider],
      null,
    );

    // Cache sanitize drops non-built-in Codex rows; active session must not
    // reintroduce them via the global provider table either.
    expect(items.map((item) => item.model.modelId)).toEqual(["gpt-5.3-codex"]);
  });

  it("still uses the global provider table for Pi", () => {
    const items = getRuntimeModelItems(
      "pi",
      [globalModel],
      [globalProvider],
      null,
    );

    expect(items.map((item) => item.model.modelId)).toEqual([
      "deepseek/deepseek-v4-flash",
    ]);
  });
});
