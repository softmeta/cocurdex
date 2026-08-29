import type {
  AgentProviderSnapshot,
  CompatibleProviderModel,
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  createProviderSnapshotForModel,
  getProviderModelSelectionLabel,
  getProviderModelSelectionValue,
  resolveRuntimeProviderModel,
} from "@/features/sessions/provider-model/provider-model-selection";

const item = {
  provider: {
    id: "volcengine",
    name: "Volcengine Coding Plan",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    enabled: true,
    apiKeySecretId: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  } as ProviderConfigRecord,
  model: {
    providerId: "volcengine",
    modelId: "ark-code-latest",
    name: "ark-code-latest",
    api: "openai-completions",
    enabled: true,
    source: "manual",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  } as ProviderModelRecord,
};

describe("provider model selection", () => {
  it("creates the grouped model label and stable selection value", () => {
    expect(getProviderModelSelectionLabel(item)).toBe(
      "Volcengine Coding Plan / ark-code-latest",
    );
    expect(getProviderModelSelectionValue(item)).toBe(
      "volcengine::ark-code-latest",
    );
  });

  it("resets model-specific runtime axes for an in-session model change", () => {
    expect(createProviderSnapshotForModel(item)).toMatchObject({
      providerId: "volcengine",
      modelId: "ark-code-latest",
      reasoningEffort: null,
      thinkingLevel: null,
      serviceTier: null,
      fastMode: null,
      openCodeAgent: null,
      openCodeVariant: null,
    });
  });

  it("uses dynamic runtime catalog metadata before the global model table", () => {
    const runtimeItem = {
      provider: {
        ...item.provider,
        id: "grok-build",
        name: "Grok Build",
      },
      model: {
        ...item.model,
        providerId: "grok-build",
        modelId: "grok-4.5",
        name: "Grok 4.5",
        supportedReasoningEfforts: [
          { reasoningEffort: "medium", description: "medium" },
        ],
      },
    } as CompatibleProviderModel;
    const snapshot = {
      providerId: "grok-build",
      modelId: "grok-4.5",
    } as AgentProviderSnapshot;

    expect(
      resolveRuntimeProviderModel("grok-build", [runtimeItem], [], snapshot),
    ).toBe(runtimeItem.model);
  });

  it("does not resolve adapter-owned agents against the global provider table", () => {
    const snapshot = {
      providerId: "openrouter",
      modelId: "deepseek/deepseek-v4-flash",
    } as AgentProviderSnapshot;
    const globalModels = [
      {
        ...item.model,
        providerId: "openrouter",
        modelId: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
      },
    ] as ProviderModelRecord[];

    expect(
      resolveRuntimeProviderModel("opencode", [], globalModels, snapshot),
    ).toBeNull();
    expect(
      resolveRuntimeProviderModel("codex", [], globalModels, snapshot),
    ).toBeNull();
  });

  it("still resolves Pi against the global provider table", () => {
    const snapshot = {
      providerId: "volcengine",
      modelId: "ark-code-latest",
    } as AgentProviderSnapshot;

    expect(resolveRuntimeProviderModel("pi", [], [item.model], snapshot)).toBe(
      item.model,
    );
  });
});
