import type {
  CommitMessageModelSelection,
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createCommitMessageProviderSnapshot } from "./commit-message-generation";

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
