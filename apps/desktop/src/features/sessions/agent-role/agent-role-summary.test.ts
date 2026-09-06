import { describe, expect, it } from "vitest";
import {
  formatAgentRoleSummary,
  resolveAgentRoleSpeedLabel,
  resolveAgentRoleThinkingLevel,
  shortModelDisplayName,
} from "./agent-role-summary";

describe("shortModelDisplayName", () => {
  it("keeps a bare model name", () => {
    expect(shortModelDisplayName("Opus 5")).toBe("Opus 5");
  });

  it("drops the provider prefix used in grouped catalogs", () => {
    expect(shortModelDisplayName("Anthropic / Opus 5")).toBe("Opus 5");
  });
});

describe("formatAgentRoleSummary", () => {
  it("joins agent, model, thinking, speed, and permission in that order", () => {
    expect(
      formatAgentRoleSummary({
        agentLabel: "Claude Agent",
        modelLabel: "Opus 5",
        thinkingLabel: "中",
        speedLabel: "开启",
        permissionLabel: "自动模式",
      }),
    ).toBe("Claude Agent · Opus 5 · 中 · 开启 · 自动模式");
  });

  it("omits missing runtime axes", () => {
    expect(
      formatAgentRoleSummary({
        agentLabel: "Codex",
        modelLabel: null,
        permissionLabel: "只读",
      }),
    ).toBe("Codex · 只读");
  });
});

describe("resolveAgentRoleThinkingLevel", () => {
  it("prefers an explicit thinking level over reasoning effort", () => {
    expect(
      resolveAgentRoleThinkingLevel({
        agentId: "claude-agent",
        providerId: "anthropic",
        modelId: "opus",
        thinkingLevel: "medium",
        reasoningEffort: "high",
      }),
    ).toBe("medium");
  });

  it("uses reasoning effort when thinking is unset", () => {
    expect(
      resolveAgentRoleThinkingLevel({
        agentId: "codex",
        providerId: "openai",
        modelId: "gpt-5.4",
        thinkingLevel: null,
        reasoningEffort: "high",
      }),
    ).toBe("high");
  });
});

describe("resolveAgentRoleSpeedLabel", () => {
  it("shows fast mode when enabled", () => {
    expect(
      resolveAgentRoleSpeedLabel(
        {
          agentId: "claude-agent",
          providerId: "anthropic",
          modelId: "opus",
          fastMode: true,
          serviceTier: null,
        },
        "On",
      ),
    ).toBe("On");
  });

  it("shows a stored service tier when fast mode is off", () => {
    expect(
      resolveAgentRoleSpeedLabel(
        {
          agentId: "codex",
          providerId: "openai",
          modelId: "gpt-5.4",
          fastMode: false,
          serviceTier: "fast",
        },
        "On",
      ),
    ).toBe("fast");
  });
});
