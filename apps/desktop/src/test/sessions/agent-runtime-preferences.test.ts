import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_RUNTIME_PREFERENCES_STORAGE_KEY,
  getAgentRuntimePreferences,
  updateAgentRuntimePreferences,
} from "@/features/sessions/agent-runtime-preferences";

describe("agent runtime preferences", () => {
  beforeEach(() => {
    window.localStorage.removeItem(AGENT_RUNTIME_PREFERENCES_STORAGE_KEY);
  });

  it("persists independent runtime choices per adapter", () => {
    updateAgentRuntimePreferences("claude-agent", {
      providerSelection: { providerId: "claude", modelId: "opus" },
      permissionMode: "claude-bypass-permissions",
      thinkingLevel: "high",
    });
    updateAgentRuntimePreferences("codex", {
      providerSelection: { providerId: "openai", modelId: "gpt-5" },
      reasoningEffort: "xhigh",
      serviceTier: "fast",
    });
    updateAgentRuntimePreferences("opencode", {
      openCodeAgent: "build",
      openCodeVariant: "high",
    });

    expect(getAgentRuntimePreferences("claude-agent")).toMatchObject({
      providerSelection: { providerId: "claude", modelId: "opus" },
      permissionMode: "claude-bypass-permissions",
      thinkingLevel: "high",
    });
    expect(getAgentRuntimePreferences("codex")).toMatchObject({
      providerSelection: { providerId: "openai", modelId: "gpt-5" },
      reasoningEffort: "xhigh",
      serviceTier: "fast",
    });
    expect(getAgentRuntimePreferences("opencode")).toMatchObject({
      openCodeAgent: "build",
      openCodeVariant: "high",
    });
  });

  it("ignores malformed stored values", () => {
    window.localStorage.setItem(
      AGENT_RUNTIME_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        "claude-agent": { providerSelection: { providerId: "claude" } },
        unknown: { thinkingLevel: "high" },
        codex: "invalid",
      }),
    );

    expect(getAgentRuntimePreferences("claude-agent")).toEqual({});
    expect(getAgentRuntimePreferences("codex")).toEqual({});
    expect(getAgentRuntimePreferences("pi")).toEqual({});
  });
});
