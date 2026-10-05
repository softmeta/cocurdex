import { describe, expect, it } from "vitest";
import { getFallbackAgentPermissionModes } from "./agent-permission-modes";
import {
  agentRuntimeAxisCapabilities,
  supportsInSessionRuntimeAxis,
} from "./agent-runtime-capabilities";
import type { AgentId } from "./contracts";

describe("agent runtime capabilities", () => {
  it("declares only in-session runtime changes", () => {
    for (const capabilities of Object.values(agentRuntimeAxisCapabilities)) {
      expect(
        Object.values(capabilities).every((value) => value === "in-session"),
      ).toBe(true);
    }
  });

  it("keeps adapter-specific axes explicit", () => {
    expect(supportsInSessionRuntimeAxis("pi", "model")).toBe(true);
    expect(supportsInSessionRuntimeAxis("pi", "speed")).toBe(false);
    expect(supportsInSessionRuntimeAxis("codex", "speed")).toBe(true);
    expect(supportsInSessionRuntimeAxis("codex", "permission")).toBe(true);
    expect(supportsInSessionRuntimeAxis("opencode", "variant")).toBe(true);
    expect(supportsInSessionRuntimeAxis("opencode", "permission")).toBe(true);
    expect(supportsInSessionRuntimeAxis("acp:cursor", "model")).toBe(true);
    expect(supportsInSessionRuntimeAxis("acp:cursor", "permission")).toBe(
      false,
    );
    expect(supportsInSessionRuntimeAxis("acp:devin", "model")).toBe(true);
    expect(supportsInSessionRuntimeAxis("acp:devin", "permission")).toBe(false);
  });

  it("fails closed for an unknown runtime agent", () => {
    expect(
      supportsInSessionRuntimeAxis("unknown-agent" as AgentId, "thinking"),
    ).toBe(false);
  });
});

describe("ACP registry agent profiles", () => {
  it("applies a vendor profile and falls back for unknown registry agents", () => {
    expect(supportsInSessionRuntimeAxis("acp:grok-build", "permission")).toBe(
      true,
    );
    expect(getFallbackAgentPermissionModes("acp:grok-build")).toHaveLength(3);
    expect(supportsInSessionRuntimeAxis("acp:goose", "speed")).toBe(true);
    expect(getFallbackAgentPermissionModes("acp:goose")).toEqual([]);
  });
});
