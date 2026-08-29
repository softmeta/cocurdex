import type { AgentDescriptor } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { sortAdaptersForSettings } from "./adapter-settings-order";

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

describe("sortAdaptersForSettings", () => {
  it("puts missing and outdated adapters ahead of ready ones, then builtin last", () => {
    const readyCodex = descriptor({
      id: "codex",
      installation: {
        executableName: "codex",
        executablePath: "/usr/bin/codex",
        version: "0.1.0",
      },
    });
    const missingOpencode = descriptor({
      id: "opencode",
      availability: "missing",
      installation: {
        executableName: "opencode",
        executablePath: null,
      },
    });
    const outdatedClaude = descriptor({
      id: "claude-agent",
      installation: {
        executableName: "claude",
        executablePath: "/usr/bin/claude",
        version: "1.0.0",
      },
    });
    const builtinPi = descriptor({ id: "pi" });

    const sorted = sortAdaptersForSettings([
      readyCodex,
      builtinPi,
      missingOpencode,
      outdatedClaude,
    ]);

    expect(sorted.map((agent) => agent.id)).toEqual([
      "opencode",
      "claude-agent",
      "codex",
      "pi",
    ]);
  });

  it("keeps the original order among adapters in the same status", () => {
    const grok = descriptor({
      id: "grok-build",
      installation: {
        executableName: "grok",
        executablePath: "/usr/bin/grok",
        version: "1.0.11",
      },
    });
    const codex = descriptor({
      id: "codex",
      installation: {
        executableName: "codex",
        executablePath: "/usr/bin/codex",
        version: "0.150.1",
      },
    });

    expect(
      sortAdaptersForSettings([grok, codex]).map((agent) => agent.id),
    ).toEqual(["grok-build", "codex"]);
  });
});
