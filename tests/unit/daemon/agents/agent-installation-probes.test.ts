import { getAgentDescriptor } from "@cocurdex/agent-core";
import {
  createAgentInstallationProbes,
  createProcessShellEnvRefresher,
} from "@cocurdex/daemon/internal/agents/agent-installation-probes";
import { describe, expect, it, vi } from "vitest";

describe("agent installation probes", () => {
  const codex = getAgentDescriptor("codex");
  const claude = getAgentDescriptor("claude-agent");

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

  it("refreshes the login shell environment once per window when a CLI is missing and retries lookup", async () => {
    let shellPathLoaded = false;
    const lookupCommand = vi.fn(async (command: string) =>
      shellPathLoaded ? `/Users/x/.local/bin/${command}` : null,
    );
    const refreshShellEnv = vi.fn(async () => {
      shellPathLoaded = true;
      return true;
    });
    const probes = createAgentInstallationProbes({
      lookupCommand,
      readVersion: async () => "2.1.0",
      refreshShellEnv,
    });

    const detected = await probes.detect([codex, claude]);
    expect(detected.map((agent) => agent.availability)).toEqual([
      "available",
      "available",
    ]);
    expect(refreshShellEnv).toHaveBeenCalledTimes(1);
    expect(lookupCommand).toHaveBeenCalledTimes(4);
  });

  it("forces a shell environment refresh when invalidated", async () => {
    const refreshShellEnv = vi.fn(async () => false);
    const probes = createAgentInstallationProbes({
      lookupCommand: async () => "/usr/local/bin/codex",
      readVersion: async () => "1.0.0",
      refreshShellEnv,
    });

    await probes.detect([codex]);
    expect(refreshShellEnv).not.toHaveBeenCalled();

    probes.invalidate();
    await probes.detect([codex]);
    expect(refreshShellEnv).toHaveBeenCalledWith({ force: true });
  });
});

describe("createProcessShellEnvRefresher", () => {
  it("retries until initial shell resolution succeeds, then skips until startup files change or forced", async () => {
    let signature = ".zshrc:100";
    const applyEnv = vi
      .fn<() => Promise<{ resolved: boolean; changed: boolean }>>()
      .mockResolvedValueOnce({ resolved: false, changed: false })
      .mockResolvedValueOnce({ resolved: true, changed: true })
      .mockResolvedValueOnce({ resolved: true, changed: true })
      .mockResolvedValueOnce({ resolved: true, changed: false });

    const refresh = createProcessShellEnvRefresher({
      platform: "darwin",
      env: { PATH: "/usr/bin:/bin" },
      readSignature: async () => signature,
      applyEnv,
    });

    expect(await refresh()).toBe(false);
    expect(await refresh()).toBe(true);
    expect(await refresh()).toBe(false);
    expect(applyEnv).toHaveBeenCalledTimes(2);

    signature = ".zshrc:200";
    expect(await refresh()).toBe(true);
    expect(applyEnv).toHaveBeenCalledTimes(3);

    expect(await refresh({ force: true })).toBe(false);
    expect(applyEnv).toHaveBeenCalledTimes(4);
  });
});
