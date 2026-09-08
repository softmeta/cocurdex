import type {
  CommitMessageModelSelection,
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonState } from "../state";

const catalogs = vi.hoisted(() => ({
  listCodexProviderModels: vi.fn(),
  listPiProviderModels: vi.fn(),
}));
vi.mock("@cocurdex/agent-adapters", () => catalogs);

import {
  createCommitMessageProviderSnapshot,
  resolveCommitMessageModel,
} from "./model";

describe("createCommitMessageProviderSnapshot", () => {
  it("forwards the dedicated commit runtime options", () => {
    const provider = {
      id: "codex",
      name: "Codex",
      baseUrl: "",
    } as ProviderConfigRecord;
    const model = {
      providerId: "codex",
      modelId: "gpt-5.6-luna",
      name: "GPT-5.6-Luna",
      api: "openai-responses",
      capabilities: ["agent", "reasoning"],
    } as ProviderModelRecord;
    const selection = {
      agentId: "codex",
      providerId: "codex",
      modelId: "gpt-5.6-luna",
      reasoningEffort: "high",
      serviceTier: "fast",
      thinkingLevel: null,
      fastMode: null,
      openCodeAgent: null,
      openCodeVariant: null,
    } satisfies CommitMessageModelSelection;

    expect(
      createCommitMessageProviderSnapshot(provider, model, selection),
    ).toMatchObject({
      modelId: "gpt-5.6-luna",
      reasoningEffort: "high",
      serviceTier: "fast",
    });
  });
});

describe("resolveCommitMessageModel", () => {
  const provider = {
    id: "provider",
    name: "Provider",
    baseUrl: "https://example.com",
    enabled: true,
  } as ProviderConfigRecord;
  const model = {
    providerId: "provider",
    modelId: "model",
    name: "Model",
    api: "openai-responses",
    enabled: true,
  } as ProviderModelRecord;
  const selection = {
    agentId: "pi",
    providerId: "provider",
    modelId: "model",
    reasoningEffort: "high",
    serviceTier: "fast",
  } as CommitMessageModelSelection;

  beforeEach(() => {
    catalogs.listCodexProviderModels.mockReset().mockResolvedValue([]);
    catalogs.listPiProviderModels.mockReset().mockResolvedValue([model]);
  });

  function state(models: ProviderModelRecord[]) {
    return {
      listProviderConfigs: vi.fn().mockResolvedValue([provider]),
      listProviderModels: vi.fn().mockResolvedValue(models),
    } as unknown as DaemonState;
  }

  it("resolves a built-in model not persisted in the database", async () => {
    await expect(
      resolveCommitMessageModel(state([]), selection),
    ).resolves.toMatchObject({
      agentId: "pi",
      providerSnapshot: {
        modelId: "model",
        reasoningEffort: "high",
        serviceTier: "fast",
      },
    });
  });

  it("keeps persisted disabling authoritative over the built-in catalog", async () => {
    await expect(
      resolveCommitMessageModel(
        state([{ ...model, enabled: false }]),
        selection,
      ),
    ).rejects.toThrow("No commit message model configured");
  });

  it("uses a native Codex model before configured providers", async () => {
    const database = state([]);
    catalogs.listCodexProviderModels.mockResolvedValue([{ provider, model }]);
    await expect(
      resolveCommitMessageModel(database, { ...selection, agentId: "codex" }),
    ).resolves.toMatchObject({
      agentId: "codex",
      providerSnapshot: { modelId: "model" },
    });
    expect(database.listProviderConfigs).not.toHaveBeenCalled();
  });
});
