import {
  type AgentPermissionMode,
  childPermissionMode,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const claude = (permissionMode: AgentPermissionMode | null) => ({
  agentId: "claude-agent" as const,
  permissionMode,
  options: [],
});
const codex = (permissionMode: AgentPermissionMode | null) => ({
  agentId: "codex" as const,
  permissionMode,
  options: [],
});

describe("childPermissionMode", () => {
  it("lowers a role's riskier mode to the riskiest mode within the parent's level", () => {
    expect(
      childPermissionMode(claude("claude-default"), codex("codex-full-access")),
    ).toEqual({
      permissionMode: "codex-read-only",
      limitedTo: "codex-read-only",
    });
    expect(
      childPermissionMode(
        claude("claude-accept-edits"),
        codex("codex-full-access"),
      ),
    ).toEqual({ permissionMode: "codex-auto", limitedTo: "codex-auto" });
  });

  it("keeps a mode at or below the parent's level", () => {
    expect(
      childPermissionMode(
        claude("claude-bypass-permissions"),
        codex("codex-full-access"),
      ),
    ).toEqual({ permissionMode: "codex-full-access", limitedTo: null });
    expect(
      childPermissionMode(claude("claude-accept-edits"), codex("codex-auto")),
    ).toEqual({ permissionMode: "codex-auto", limitedTo: null });
  });

  it("ranks an unset mode as the agent's default, the first option", () => {
    expect(childPermissionMode(claude(null), codex(null))).toEqual({
      permissionMode: null,
      limitedTo: null,
    });
    expect(childPermissionMode(claude(null), codex("codex-auto"))).toEqual({
      permissionMode: "codex-read-only",
      limitedTo: "codex-read-only",
    });
  });

  it("ranks the parent's live options, such as a mode only the installed CLI reports", () => {
    const parent = {
      agentId: "claude-agent" as const,
      permissionMode: "claude-auto" as const,
      options: [{ id: "claude-auto" as const, risk: "elevated" as const }],
    };
    expect(childPermissionMode(parent, codex("codex-full-access"))).toEqual({
      permissionMode: "codex-auto",
      limitedTo: "codex-auto",
    });
  });

  it("treats a mode the child's agent does not know as the riskiest", () => {
    expect(
      childPermissionMode(
        claude("claude-accept-edits"),
        codex("claude-default"),
      ),
    ).toEqual({ permissionMode: "codex-auto", limitedTo: "codex-auto" });
  });

  it("leaves agents without tool approvals unbounded on either side", () => {
    const pi = { agentId: "pi" as const, permissionMode: null, options: [] };
    expect(childPermissionMode(claude("claude-default"), pi)).toEqual({
      permissionMode: null,
      limitedTo: null,
    });
    expect(childPermissionMode(pi, codex("codex-full-access"))).toEqual({
      permissionMode: "codex-full-access",
      limitedTo: null,
    });
  });
});
