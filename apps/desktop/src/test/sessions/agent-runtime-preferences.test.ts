import { getFallbackAgentPermissionModes } from "@cocurdex/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_RUNTIME_PREFERENCES_STORAGE_KEY,
  getAgentRuntimePreferences,
  resolvePreferredPermissionMode,
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

describe("resolvePreferredPermissionMode", () => {
  const grokModes = getFallbackAgentPermissionModes("grok-build");

  beforeEach(() => {
    window.localStorage.removeItem(AGENT_RUNTIME_PREFERENCES_STORAGE_KEY);
  });

  it("restores the cached permission mode when it is still valid for the agent", () => {
    updateAgentRuntimePreferences("grok-build", {
      permissionMode: "grok-auto",
    });

    expect(resolvePreferredPermissionMode("grok-build", grokModes)).toBe(
      "grok-auto",
    );
  });

  it("falls back to the agent's default mode when nothing is cached", () => {
    expect(resolvePreferredPermissionMode("grok-build", grokModes)).toBe(
      "grok-ask",
    );
  });

  it("falls back to the agent's default mode when the cache is not in the current options", () => {
    updateAgentRuntimePreferences("grok-build", {
      permissionMode: "claude-bypass-permissions",
    });

    expect(resolvePreferredPermissionMode("grok-build", grokModes)).toBe(
      "grok-ask",
    );
  });

  it("returns null when the agent has no permission modes", () => {
    updateAgentRuntimePreferences("pi", {
      permissionMode: "grok-auto",
    });

    expect(resolvePreferredPermissionMode("pi", [])).toBeNull();
  });
});
