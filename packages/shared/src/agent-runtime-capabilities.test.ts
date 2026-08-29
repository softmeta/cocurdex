import { describe, expect, it } from "vitest";
import {
  agentRuntimeAxisCapabilities,
  supportsInSessionRuntimeAxis,
} from "./agent-runtime-capabilities";
import type { AgentId } from "./contracts";

describe("agent runtime capabilities", () => {
  it("declares only in-session runtime changes", () => {
    for (const capabilities of Object.values(agentRuntimeAxisCapabilities)) {
      expect(Object.values(capabilities)).toEqual(
        expect.arrayContaining(["in-session"]),
      );
      expect(Object.values(capabilities)).not.toContain("restart-session");
    }
  });

  it("keeps adapter-specific axes explicit", () => {
    expect(supportsInSessionRuntimeAxis("pi", "model")).toBe(true);
    expect(supportsInSessionRuntimeAxis("pi", "speed")).toBe(false);
    expect(supportsInSessionRuntimeAxis("codex", "speed")).toBe(true);
    expect(supportsInSessionRuntimeAxis("codex", "permission")).toBe(true);
    expect(supportsInSessionRuntimeAxis("opencode", "variant")).toBe(true);
    expect(supportsInSessionRuntimeAxis("opencode", "permission")).toBe(true);
  });

  it("fails closed for an unknown runtime agent", () => {
    expect(
      supportsInSessionRuntimeAxis("unknown-agent" as AgentId, "thinking"),
    ).toBe(false);
  });
});
