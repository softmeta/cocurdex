import { getAgentDescriptor } from "@cocurdex/agent-core";
import { createAgentInstallationProbes } from "@cocurdex/daemon/internal/agents/agent-installation-probes";
import { describe, expect, it, vi } from "vitest";

describe("agent installation probes", () => {
  const codex = getAgentDescriptor("codex");

  it("shares concurrent and repeated probes, then detects external changes", async () => {
    let now = 0;
    const lookupCommand = vi.fn(async () => "codex");
    const readVersion = vi.fn(async () => "1.0.0");
    const probes = createAgentInstallationProbes(
      { lookupCommand, readVersion },
      () => now,
    );

    const [all, single] = await Promise.all([
      probes.detect([codex, getAgentDescriptor("pi")]),
      probes.detect([codex]),
    ]);
    expect(single[0]).toEqual(all[0]);
    expect((await probes.detect([codex]))[0]?.installation?.version).toBe(
      "1.0.0",
    );
    expect(lookupCommand).toHaveBeenCalledTimes(1);
    expect(readVersion).toHaveBeenCalledTimes(1);

    now += 5_000;
    readVersion.mockResolvedValue("2.0.0");
    expect((await probes.detect([codex]))[0]?.installation?.version).toBe(
      "2.0.0",
    );
  });

  it("refreshes immediately when the daemon invalidates the cache", async () => {
    const lookupCommand = vi.fn<() => Promise<string | null>>(async () => null);
    const probes = createAgentInstallationProbes({
      lookupCommand,
      readVersion: async () => "1.0.0",
    });
    expect((await probes.detect([codex]))[0]?.availability).toBe("missing");

    lookupCommand.mockResolvedValue("codex");
    probes.invalidate();
    expect((await probes.detect([codex]))[0]?.availability).toBe("available");
  });
});
