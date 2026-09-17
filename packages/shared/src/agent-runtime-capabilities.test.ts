import { describe, expect, it } from "vitest";
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
    expect(supportsInSessionRuntimeAxis("cursor", "model")).toBe(true);
    expect(supportsInSessionRuntimeAxis("cursor", "permission")).toBe(false);
    expect(supportsInSessionRuntimeAxis("devin", "model")).toBe(true);
    expect(supportsInSessionRuntimeAxis("devin", "permission")).toBe(false);
  });

  it("fails closed for an unknown runtime agent", () => {
    expect(
      supportsInSessionRuntimeAxis("unknown-agent" as AgentId, "thinking"),
    ).toBe(false);
  });
});
