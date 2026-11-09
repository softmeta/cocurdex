import type { AgentDescriptor } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  sortAdaptersForSettings,
  splitAdaptersForSettings,
} from "@/features/settings/adapters/adapter-settings-order";

function descriptor(
  patch: Partial<AgentDescriptor> & Pick<AgentDescriptor, "id">,
): AgentDescriptor {
  return {
    label: patch.id,
    availability: "available",
    capabilities: {
      sessionModes: [],
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
  it("puts builtin first, then missing and outdated adapters ahead of ready ones, and disabled last", () => {
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
    const disabledGrok = descriptor({
      id: "acp:grok-build",
      enabled: false,
      availability: "missing",
      installation: {
        executableName: "grok",
        executablePath: null,
      },
    });
    const builtinPi = descriptor({ id: "pi" });

    const sorted = sortAdaptersForSettings([
      disabledGrok,
      readyCodex,
      builtinPi,
      missingOpencode,
      outdatedClaude,
    ]);

    expect(sorted.map((agent) => agent.id)).toEqual([
      "pi",
      "opencode",
      "claude-agent",
      "codex",
      "acp:grok-build",
    ]);
  });

  it("keeps the original order among adapters in the same status", () => {
    const grok = descriptor({
      id: "acp:grok-build",
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
    ).toEqual(["acp:grok-build", "codex"]);
  });
});

describe("splitAdaptersForSettings", () => {
  it("splits active installed adapters from collapsed disabled and missing groups", () => {
    const missingOpencode = descriptor({
      id: "opencode",
      availability: "missing",
      installation: { executableName: "opencode", executablePath: null },
    });
    const failingCodex = descriptor({
      id: "codex",
      availability: "error",
      installation: {
        executableName: "codex",
        executablePath: null,
        error: "lookup failed",
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

    const disabledGrok = descriptor({
      id: "acp:grok-build",
      enabled: false,
      availability: "missing",
      installation: { executableName: "grok", executablePath: null },
    });

    const { installed, disabled, missing } = splitAdaptersForSettings([
      disabledGrok,
      missingOpencode,
      descriptor({ id: "pi" }),
      failingCodex,
      outdatedClaude,
    ]);

    expect(installed.map((agent) => agent.id)).toEqual([
      "pi",
      "codex",
      "claude-agent",
    ]);
    expect(disabled.map((agent) => agent.id)).toEqual(["acp:grok-build"]);
    expect(missing.map((agent) => agent.id)).toEqual(["opencode"]);
  });
});
