import type { AgentDescriptor } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { getAdapterStatus, isAgentReadyToStart } from "./adapter-status";

function descriptor(
  patch: Partial<AgentDescriptor> & Pick<AgentDescriptor, "id">,
): AgentDescriptor {
  return {
    label: patch.id,
    availability: "available",
    capabilities: {
      collaborationModes: ["default"],
      permissionModes: [],
      writeModes: ["read-only"],
      supportsSteering: false,
      supportsStreaming: true,
      supportsSelections: true,
      sessionTitleStrategy: "native",
      transport: "native",
    },
    ...patch,
  };
}

describe("getAdapterStatus", () => {
  it("treats Pi as builtin without waiting on installation detection", () => {
    expect(getAdapterStatus(descriptor({ id: "pi" })).kind).toBe("builtin");
    expect(isAgentReadyToStart(descriptor({ id: "pi" }))).toBe(true);
  });

  it("treats a CLI with no installation record as still detecting", () => {
    const agent = descriptor({ id: "codex" });
    expect(getAdapterStatus(agent).kind).toBe("detecting");
    expect(isAgentReadyToStart(agent)).toBe(false);
  });

  it("marks a missing CLI as not ready to start", () => {
    const agent = descriptor({
      id: "codex",
      availability: "missing",
      installation: {
        executableName: "codex",
        executablePath: null,
      },
    });
    expect(getAdapterStatus(agent).kind).toBe("missing");
    expect(isAgentReadyToStart(agent)).toBe(false);
  });

  it("keeps an outdated CLI selectable", () => {
    const agent = descriptor({
      id: "claude-agent",
      availability: "available",
      installation: {
        executableName: "claude",
        executablePath: "/usr/local/bin/claude",
        version: "1.0.0",
      },
    });
    expect(getAdapterStatus(agent).kind).toBe("outdated");
    expect(isAgentReadyToStart(agent)).toBe(true);
  });
});
