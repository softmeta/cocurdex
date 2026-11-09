import type { InitializeResponse } from "@agentclientprotocol/sdk/unstable";
import {
  antigravitySessionMeta,
  antigravityWritesRunWorkflowSkill,
} from "@cocurdex/agent-adapters/internal/acp-registry/antigravity-session-meta";
import { describe, expect, it } from "vitest";

function initialize(version: string): InitializeResponse {
  return {
    protocolVersion: 1,
    agentCapabilities: {},
    agentInfo: { name: "antigravity-acp", version },
  };
}

describe("antigravityWritesRunWorkflowSkill", () => {
  it("covers the releases that write the run-workflow skill into the session cwd", () => {
    expect(antigravityWritesRunWorkflowSkill("1.4.1")).toBe(false);
    expect(antigravityWritesRunWorkflowSkill("1.4.2")).toBe(true);
    expect(antigravityWritesRunWorkflowSkill("1.4.5")).toBe(true);
    expect(antigravityWritesRunWorkflowSkill("1.4.6")).toBe(false);
    expect(antigravityWritesRunWorkflowSkill("1.5.0")).toBe(false);
    expect(antigravityWritesRunWorkflowSkill("agy_acp_server_1.4.5")).toBe(
      true,
    );
  });

  it("does not guess from a missing version", () => {
    expect(antigravityWritesRunWorkflowSkill(null)).toBe(false);
    expect(antigravityWritesRunWorkflowSkill(undefined)).toBe(false);
    expect(antigravityWritesRunWorkflowSkill("")).toBe(false);
  });
});

describe("antigravitySessionMeta", () => {
  it("disables run_workflow only while the agent writes the skill", () => {
    expect(antigravitySessionMeta(initialize("1.4.5"))).toEqual({
      antigravity: { disabledTools: ["run_workflow"] },
    });
    expect(antigravitySessionMeta(initialize("1.4.1"))).toBeUndefined();
    expect(antigravitySessionMeta(initialize("1.5.0"))).toBeUndefined();
  });
});
