import { describe, expect, it } from "vitest";
import type { AgentRoleRecord } from "./agent-role";
import {
  agentRoleMatchesDraft,
  projectAgentRoleToExecutorBinding,
  workflowPermissionProfileForAgentRole,
} from "./agent-role";

function role(overrides: Partial<AgentRoleRecord> = {}): AgentRoleRecord {
  return {
    id: "role-1",
    name: "Review",
    agentId: "codex",
    providerId: "openai",
    modelId: "gpt-5.4",
    modelName: "GPT-5.4",
    permissionMode: "codex-read-only",
    collaborationMode: "default",
    reasoningEffort: "high",
    serviceTier: null,
    fastMode: null,
    thinkingLevel: null,
    openCodeAgent: null,
    openCodeVariant: null,
    instructions: null,
    skillIds: null,
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("workflowPermissionProfileForAgentRole", () => {
  it("maps read-only Codex permission to the read_only profile", () => {
    expect(
      workflowPermissionProfileForAgentRole({
        agentId: "codex",
        permissionMode: "codex-read-only",
      }),
    ).toBe("read_only");
  });

  it("maps auto Codex permission to workspace_write", () => {
    expect(
      workflowPermissionProfileForAgentRole({
        agentId: "codex",
        permissionMode: "codex-auto",
      }),
    ).toBe("workspace_write");
  });

  it("rejects dangerous permission modes", () => {
    expect(
      workflowPermissionProfileForAgentRole({
        agentId: "codex",
        permissionMode: "codex-full-access",
      }),
    ).toBeNull();
  });

  it("treats Pi as read_only when it has no permission mode", () => {
    expect(
      workflowPermissionProfileForAgentRole({
        agentId: "pi",
        permissionMode: null,
      }),
    ).toBe("read_only");
  });
});

describe("projectAgentRoleToExecutorBinding", () => {
  it("freezes a read-only role onto planner with provenance and runtime axes", () => {
    const binding = projectAgentRoleToExecutorBinding(role(), "planner");

    expect(binding).toMatchObject({
      agentId: "codex",
      agentRoleId: "role-1",
      model: "gpt-5.4",
      permissionProfile: "read_only",
      runtime: {
        permissionMode: "codex-read-only",
        collaborationMode: "default",
        reasoningEffort: "high",
      },
    });
    expect(binding.providerSnapshot).toMatchObject({
      providerId: "openai",
      modelId: "gpt-5.4",
      reasoningEffort: "high",
    });
  });

  it("ignores plan collaboration mode when projecting into a workflow binding", () => {
    const binding = projectAgentRoleToExecutorBinding(
      role({ collaborationMode: "plan" }),
      "reviewer",
    );

    expect(binding.runtime).toMatchObject({ collaborationMode: "default" });
  });

  it("rejects a read-only role for the implementer slot", () => {
    expect(() =>
      projectAgentRoleToExecutorBinding(role(), "implementer"),
    ).toThrow("implementer");
  });

  it("rejects a full-access role for every workflow slot", () => {
    const dangerous = role({ permissionMode: "codex-full-access" });

    expect(() =>
      projectAgentRoleToExecutorBinding(dangerous, "planner"),
    ).toThrow("planner");
    expect(() =>
      projectAgentRoleToExecutorBinding(dangerous, "implementer"),
    ).toThrow("implementer");
  });
});

describe("agentRoleMatchesDraft", () => {
  it("treats empty strings and default thinking as unset", () => {
    expect(
      agentRoleMatchesDraft(role({ thinkingLevel: null, serviceTier: null }), {
        agentId: "codex",
        providerId: "openai",
        modelId: "gpt-5.4",
        modelName: "GPT-5.4",
        permissionMode: "codex-read-only",
        collaborationMode: "default",
        reasoningEffort: "high",
        serviceTier: "",
        fastMode: false,
        thinkingLevel: "default",
        openCodeAgent: "",
        openCodeVariant: "",
      }),
    ).toBe(true);
  });

  it("does not match when permission diverges", () => {
    expect(
      agentRoleMatchesDraft(role(), {
        ...role(),
        permissionMode: "codex-auto",
      }),
    ).toBe(false);
  });
});
