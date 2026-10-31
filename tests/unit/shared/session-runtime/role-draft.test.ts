import {
  type AgentProviderSnapshot,
  roleDraftFromSession,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const snapshot = {
  providerId: "anthropic",
  providerName: "Anthropic",
  modelId: "opus",
  modelName: "Opus",
  api: "anthropic-messages",
  baseUrl: "https://api.example.invalid",
  thinkingLevel: "high",
  fastMode: true,
} as AgentProviderSnapshot;

describe("roleDraftFromSession", () => {
  it("captures the session's model, permission, and runtime choices", () => {
    expect(
      roleDraftFromSession({
        agentType: "claude-agent",
        providerSnapshot: snapshot,
        permissionMode: "claude-accept-edits",
        sessionModeId: null,
      }),
    ).toEqual({
      agentId: "claude-agent",
      providerId: "anthropic",
      modelId: "opus",
      modelName: "Opus",
      permissionMode: "claude-accept-edits",
      sessionModeId: null,
      reasoningEffort: null,
      serviceTier: null,
      fastMode: true,
      thinkingLevel: "high",
      openCodeAgent: null,
      openCodeVariant: null,
    });
  });

  it("keeps the agent's default model when the session has none", () => {
    const draft = roleDraftFromSession({
      agentType: "pi",
      providerSnapshot: null,
      sessionModeId: null,
    });

    expect(draft).toMatchObject({
      agentId: "pi",
      providerId: null,
      modelId: null,
      permissionMode: null,
    });
  });
});
