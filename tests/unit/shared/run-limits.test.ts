import {
  DEFAULT_AGENT_RUN_LIMITS,
  decideRunAdmission,
  isDelegatedSession,
  parseAgentRunLimits,
  resolveAgentRunLimits,
  resolveStoredAgentRunLimits,
} from "@cocurdex/shared/internal/run-limits";
import { describe, expect, it } from "vitest";

const limits = {
  maxConcurrentRuns: 3,
  maxConcurrentRunsPerAgent: 2,
  delegatedRunTimeoutMinutes: 30,
};

describe("decideRunAdmission", () => {
  it("admits a run while both the host and the agent have room", () => {
    expect(
      decideRunAdmission({
        agentType: "codex",
        activeAgentTypes: ["codex", "claude-agent"],
        limits,
      }),
    ).toEqual({ admit: true });
  });

  it("holds a run once its agent reaches the per-agent limit", () => {
    expect(
      decideRunAdmission({
        agentType: "codex",
        activeAgentTypes: ["codex", "codex"],
        limits,
      }),
    ).toEqual({ admit: false, limit: "agent" });
  });

  it("holds every run once the host is full, whatever the agent", () => {
    expect(
      decideRunAdmission({
        agentType: "pi",
        activeAgentTypes: ["codex", "claude-agent", "claude-agent"],
        limits,
      }),
    ).toEqual({ admit: false, limit: "host" });
  });
});

describe("agent run limits setting", () => {
  it("accepts a valid value and a disabled timeout", () => {
    expect(parseAgentRunLimits(limits)).toEqual(limits);
    expect(
      parseAgentRunLimits({ ...limits, delegatedRunTimeoutMinutes: null }),
    ).toEqual({ ...limits, delegatedRunTimeoutMinutes: null });
  });

  it.each([
    { ...limits, maxConcurrentRuns: 0 },
    { ...limits, maxConcurrentRunsPerAgent: 1.5 },
    { ...limits, delegatedRunTimeoutMinutes: 0 },
    { ...limits, delegatedRunTimeoutMinutes: "30" },
    null,
    [],
  ])("rejects %j", (value) => {
    expect(parseAgentRunLimits(value)).toBeNull();
  });

  it("falls back to the defaults for a missing or corrupt stored value", () => {
    expect(resolveAgentRunLimits(undefined)).toEqual(DEFAULT_AGENT_RUN_LIMITS);
    expect(resolveAgentRunLimits({ maxConcurrentRuns: -1 })).toEqual(
      DEFAULT_AGENT_RUN_LIMITS,
    );
    expect(resolveStoredAgentRunLimits("{oops")).toEqual(
      DEFAULT_AGENT_RUN_LIMITS,
    );
    expect(resolveStoredAgentRunLimits(JSON.stringify(limits))).toEqual(limits);
  });
});

describe("isDelegatedSession", () => {
  it("covers teammates and script agents but not user sessions", () => {
    expect(
      isDelegatedSession({ sessionKind: "teammate", parentSessionId: "lead" }),
    ).toBe(true);
    expect(
      isDelegatedSession({ sessionKind: "subagent", parentSessionId: "lead" }),
    ).toBe(true);
    expect(
      isDelegatedSession({ sessionKind: "main", parentSessionId: null }),
    ).toBe(false);
    expect(
      isDelegatedSession({ sessionKind: "chat", parentSessionId: null }),
    ).toBe(false);
  });
});
