import type { AgentAdapter } from "@cocurdex/agent-core";
import { createAgentRegistry } from "@cocurdex/agent-core";
import { describe, expect, it, vi } from "vitest";
import { discoverInstalledAgentCapabilities } from "./agent-capability-discovery";

describe("discoverInstalledAgentCapabilities", () => {
  it("merges capabilities reported by an installed agent adapter", async () => {
    const claudeCli = createAgentRegistry()
      .list()
      .find((agent) => agent.id === "claude-agent");
    if (!claudeCli) {
      throw new Error("Claude Agent descriptor is missing");
    }
    const discoverCapabilities = vi.fn(async () => ({
      capabilities: {
        permissionModes: [
          { id: "claude-default" as const, risk: "normal" as const },
          { id: "claude-auto" as const, risk: "elevated" as const },
        ],
      },
      version: "2.1.220 (Claude Code)",
    }));
    const createAdapter = vi.fn(
      () =>
        ({
          discoverCapabilities,
        }) as unknown as AgentAdapter,
    );

    const [discovered] = await discoverInstalledAgentCapabilities(
      [
        {
          ...claudeCli,
          installation: {
            executableName: "claude",
            executablePath: "/usr/local/bin/claude",
          },
        },
      ],
      { createAdapter },
    );

    expect(discoverCapabilities).toHaveBeenCalledWith({
      executablePath: "/usr/local/bin/claude",
    });
    expect(discovered?.capabilities.permissionModes).toEqual([
      { id: "claude-default", risk: "normal" },
      { id: "claude-auto", risk: "elevated" },
    ]);
    // Versions are normalized to a bare semver so the settings UI can compare them.
    expect(discovered?.installation?.version).toBe("2.1.220");
  });

  it("does not create adapters for missing installations", async () => {
    const missingAgent = createAgentRegistry().list()[0];
    if (!missingAgent) {
      throw new Error("Agent registry is empty");
    }
    const createAdapter = vi.fn();

    const [discovered] = await discoverInstalledAgentCapabilities(
      [
        {
          ...missingAgent,
          availability: "missing",
          installation: {
            executableName: "claude",
            executablePath: null,
          },
        },
      ],
      { createAdapter },
    );

    expect(createAdapter).not.toHaveBeenCalled();
    expect(discovered?.availability).toBe("missing");
  });
});
