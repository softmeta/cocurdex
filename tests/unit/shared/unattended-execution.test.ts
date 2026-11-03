import type {
  AgentPermissionModeOption,
  AgentSessionConfigOption,
} from "@cocurdex/shared";
import { EMPTY_AGENT_SESSION_RUNTIME_STATE } from "@cocurdex/shared/internal/session-runtime/session-runtime-state";
import {
  isAttendedConfigChange,
  sessionRunsUnattended,
  type UnattendedSessionFacts,
} from "@cocurdex/shared/internal/unattended-execution";
import { describe, expect, it } from "vitest";

const CLAUDE_MODES: AgentPermissionModeOption[] = [
  { id: "claude-default", risk: "normal" },
  { id: "claude-accept-edits", risk: "elevated" },
  { id: "claude-auto", risk: "elevated" },
  { id: "claude-bypass-permissions", risk: "dangerous" },
];

function session(
  overrides: Partial<UnattendedSessionFacts> = {},
): UnattendedSessionFacts {
  return {
    agentType: "claude-agent",
    sessionKind: "main",
    permissionMode: "claude-default",
    sessionModeId: null,
    ...overrides,
  };
}

function modeOption(currentValue: string): AgentSessionConfigOption {
  return {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select",
    currentValue,
  };
}

describe("sessionRunsUnattended", () => {
  it("treats only dangerous or unknown permission modes as unattended", () => {
    expect(sessionRunsUnattended(session(), CLAUDE_MODES)).toBe(false);
    expect(
      sessionRunsUnattended(
        session({ permissionMode: "claude-accept-edits" }),
        CLAUDE_MODES,
      ),
    ).toBe(false);
    expect(
      sessionRunsUnattended(
        session({ permissionMode: "claude-bypass-permissions" }),
        CLAUDE_MODES,
      ),
    ).toBe(true);
    expect(
      sessionRunsUnattended(session({ permissionMode: "claude-auto" }), []),
    ).toBe(true);
  });

  it("treats agents that never ask for approval as unattended, except plain chat", () => {
    const pi = session({ agentType: "pi", permissionMode: undefined });
    expect(sessionRunsUnattended(pi, [])).toBe(true);
    expect(sessionRunsUnattended({ ...pi, sessionKind: "chat" }, [])).toBe(
      false,
    );
  });

  it("allows only default and plan among agent-reported modes", () => {
    const acp = session({
      agentType: "acp:gemini",
      permissionMode: undefined,
    });
    const withMode = (currentModeId: string) => ({
      ...EMPTY_AGENT_SESSION_RUNTIME_STATE,
      mode: { availableModes: [], currentModeId },
    });
    expect(sessionRunsUnattended(acp, [], withMode("plan"))).toBe(false);
    expect(sessionRunsUnattended(acp, [], withMode("yolo"))).toBe(true);
    expect(
      sessionRunsUnattended(acp, [], {
        ...EMPTY_AGENT_SESSION_RUNTIME_STATE,
        configOptions: [modeOption("bypassPermissions")],
      }),
    ).toBe(true);
    expect(
      sessionRunsUnattended({ ...acp, sessionModeId: "acceptEdits" }, []),
    ).toBe(true);
  });
});

describe("isAttendedConfigChange", () => {
  it("allows model and thinking changes and only attended mode values", () => {
    const model: AgentSessionConfigOption = {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "fast",
    };
    expect(isAttendedConfigChange(model, "slow")).toBe(true);
    expect(isAttendedConfigChange(modeOption("default"), "plan")).toBe(true);
    expect(isAttendedConfigChange(modeOption("default"), "yolo")).toBe(false);
    expect(isAttendedConfigChange(undefined, "anything")).toBe(false);
    expect(
      isAttendedConfigChange({ ...model, category: null }, "anything"),
    ).toBe(false);
  });
});
