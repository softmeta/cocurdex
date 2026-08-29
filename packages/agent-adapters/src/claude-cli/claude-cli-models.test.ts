import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listClaudeCliProviderModels,
  resetClaudeCliProviderModelsCache,
} from "./claude-cli-models";

interface TestClaudeCliModelInfo {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
}

function createModelProbe(models: TestClaudeCliModelInfo[]) {
  return vi.fn(async () => models);
}

describe("listClaudeCliProviderModels", () => {
  beforeEach(() => {
    resetClaudeCliProviderModelsCache();
  });

  it("maps models reported by the user's Claude Agent initialize handshake", async () => {
    const lookupExecutable = vi.fn(async () => "/usr/local/bin/claude");
    const modelProbe = createModelProbe([
      {
        value: "default",
        displayName: "Default",
        description: "Sonnet 5 · Account default",
        supportsEffort: true,
        supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
        supportsAdaptiveThinking: true,
      },
      {
        value: "sonnet",
        displayName: "Sonnet",
        description: "Sonnet 5 · Efficient for routine tasks",
        supportsEffort: true,
        supportedEffortLevels: ["low", "medium", "high", "max"],
        supportsAdaptiveThinking: true,
      },
    ]);

    const items = await listClaudeCliProviderModels(
      lookupExecutable,
      modelProbe,
    );

    expect(items).toHaveLength(9);
    expect(items[0]).toMatchObject({
      provider: { id: "claude-agent", name: "Claude Agent" },
      model: {
        modelId: "sonnet",
        name: "Sonnet 5",
        reasoning: true,
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "low" },
          { reasoningEffort: "medium", description: "medium" },
          { reasoningEffort: "high", description: "high" },
          { reasoningEffort: "max", description: "max" },
        ],
      },
    });
    expect(items.some(({ model }) => model.modelId === "")).toBe(false);
    expect(items.some(({ model }) => model.isDefault)).toBe(false);
    expect(items.map(({ model }) => model.modelId)).toEqual([
      "sonnet",
      "claude-fable-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-opus-4-5",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ]);
    expect(modelProbe).toHaveBeenCalledWith("/usr/local/bin/claude");
  });

  it("preserves display qualifiers while adding the version from the model description", async () => {
    const modelProbe = createModelProbe([
      {
        value: "opus[1m]",
        displayName: "Opus (1M context)",
        description: "Opus 5 with 1M context · Best for complex tasks",
      },
      {
        value: "custom-model",
        displayName: "Custom model",
        description: "Configured by the user",
      },
    ]);

    const items = await listClaudeCliProviderModels(
      async () => "/usr/local/bin/claude",
      modelProbe,
    );

    expect(items.slice(0, 2).map(({ model }) => model.name)).toEqual([
      "Opus 5 (1M context)",
      "Custom model",
    ]);
  });

  it("does not add static entries for models already reported by runtime aliases", async () => {
    const modelProbe = createModelProbe([
      {
        value: "fable",
        displayName: "Fable",
        description: "Fable 5 · Balanced for everyday work",
      },
      {
        value: "opus",
        displayName: "Opus",
        description: "Opus 5 · Best for complex tasks",
      },
      {
        value: "sonnet",
        displayName: "Sonnet",
        description: "Sonnet 5 · Efficient for routine tasks",
      },
      {
        value: "haiku",
        displayName: "Haiku",
        description: "Haiku 4.5 · Fast responses",
      },
    ]);

    const items = await listClaudeCliProviderModels(
      async () => "/usr/local/bin/claude",
      modelProbe,
    );

    for (const modelName of ["Fable 5", "Opus 5", "Sonnet 5", "Haiku 4.5"]) {
      expect(
        items.filter(({ model }) =>
          model.name.replace(/^Claude /, "").startsWith(modelName),
        ),
      ).toHaveLength(1);
    }
  });

  it("returns an empty catalog when Claude Agent is not installed", async () => {
    const modelProbe = createModelProbe([]);

    const items = await listClaudeCliProviderModels(
      async () => null,
      modelProbe,
    );

    expect(items).toEqual([]);
    expect(modelProbe).not.toHaveBeenCalled();
  });

  it("adds T3's static catalog without replacing dynamic metadata", async () => {
    const modelProbe = createModelProbe([
      {
        value: "claude-opus-4-6",
        displayName: "Opus 4.6 (account label)",
        description: "Account-specific description",
        supportsEffort: true,
        supportedEffortLevels: ["high"],
        supportsFastMode: true,
      },
    ]);

    const items = await listClaudeCliProviderModels(
      async () => "/usr/local/bin/claude",
      modelProbe,
    );

    const opus = items.find(({ model }) => model.modelId === "claude-opus-4-6");
    expect(opus).toMatchObject({
      model: {
        name: "Opus 4.6 (account label)",
        source: "api",
        supportsFastMode: true,
        supportedReasoningEfforts: [
          { reasoningEffort: "high", description: "high" },
        ],
      },
    });
    expect(
      items.filter(({ model }) => model.modelId === "claude-opus-4-6"),
    ).toHaveLength(1);
    expect(
      items
        .filter(({ model }) => model.source === "manual")
        .map(({ model }) => model.name),
    ).toEqual([
      "Fable 5",
      "Opus 5",
      "Opus 4.8",
      "Opus 4.7",
      "Opus 4.5",
      "Sonnet 5",
      "Sonnet 4.6",
      "Haiku 4.5",
    ]);
    expect(
      items.some(({ model }) => model.modelId === "claude-sonnet-4-6"),
    ).toBe(true);
  });

  it("propagates probe failures and allows a later retry", async () => {
    const lookupExecutable = vi.fn(async () => "/usr/local/bin/claude");
    const modelProbe = vi
      .fn()
      .mockRejectedValueOnce(new Error("probe failed"))
      .mockResolvedValueOnce([
        {
          value: "opus",
          displayName: "Opus",
          description: "Most capable",
        },
      ]);

    await expect(
      listClaudeCliProviderModels(lookupExecutable, modelProbe),
    ).rejects.toThrow("probe failed");
    await expect(
      listClaudeCliProviderModels(lookupExecutable, modelProbe),
    ).resolves.toHaveLength(10);
    expect(modelProbe).toHaveBeenCalledTimes(2);
  });

  it("reuses a successfully resolved catalog", async () => {
    const modelProbe = createModelProbe([
      {
        value: "opus",
        displayName: "Opus",
        description: "Most capable",
      },
    ]);
    const lookupExecutable = vi.fn(async () => "/usr/local/bin/claude");

    await listClaudeCliProviderModels(lookupExecutable, modelProbe);
    await listClaudeCliProviderModels(lookupExecutable, modelProbe);

    expect(modelProbe).toHaveBeenCalledOnce();
  });

  it("bypasses a resolved catalog when force refreshing", async () => {
    const lookupExecutable = vi.fn(async () => "/usr/local/bin/claude");
    const modelProbe = vi
      .fn()
      .mockResolvedValueOnce([
        {
          value: "sonnet",
          displayName: "Sonnet",
          description: "Fast",
        },
      ])
      .mockResolvedValueOnce([
        {
          value: "opus",
          displayName: "Opus",
          description: "Most capable",
        },
      ]);

    const first = await listClaudeCliProviderModels(
      lookupExecutable,
      modelProbe,
    );
    const refreshed = await listClaudeCliProviderModels(
      lookupExecutable,
      modelProbe,
      { forceRefresh: true },
    );

    expect(modelProbe).toHaveBeenCalledTimes(2);
    expect(first.some(({ model }) => model.modelId === "sonnet")).toBe(true);
    expect(refreshed.some(({ model }) => model.modelId === "opus")).toBe(true);
  });
});
