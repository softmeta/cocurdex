import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DaemonBackgroundService } from "@cocurdex/daemon/internal/background/background-service";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

function memorySettings() {
  const values = new Map<string, string>();
  return {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, valueJson: string) => {
      values.set(key, valueJson);
    },
  };
}

async function linuxService(
  launchCommand: string[] | null = ["/opt/Cocurdex/cocurdex"],
) {
  const homeDir = await tempDirs.create("cocurdex-background-");
  const userDataPath = path.join(homeDir, ".config", "Cocurdex");
  const service = new DaemonBackgroundService({
    settings: memorySettings(),
    target: launchCommand
      ? {
          platform: "linux",
          launchCommand,
          userDataPath,
          defaultUserDataPath: userDataPath,
          homeDir,
        }
      : null,
  });
  const autostartEntries = async () => {
    try {
      return await readdir(path.join(homeDir, ".config", "autostart"));
    } catch {
      return [];
    }
  };
  return { service, homeDir, autostartEntries };
}

describe("daemon background mode", () => {
  it("registers the login item when this computer turns it on and removes it when turned off", async () => {
    const { service, homeDir, autostartEntries } = await linuxService();

    const enabled = await service.set(true, { kind: "local" });

    expect(enabled).toEqual({
      enabled: true,
      available: true,
      registered: true,
    });
    const [entry] = await autostartEntries();
    const content = await readFile(
      path.join(homeDir, ".config", "autostart", entry),
      "utf8",
    );
    expect(content).toContain(
      "Exec=/opt/Cocurdex/cocurdex --background-daemon",
    );

    const disabled = await service.set(false, { kind: "local" });

    expect(disabled).toEqual({
      enabled: false,
      available: true,
      registered: false,
    });
    expect(await autostartEntries()).toEqual([]);
  });

  it("refuses a paired device even with host admin scope and leaves nothing behind", async () => {
    const { service, autostartEntries } = await linuxService();

    await expect(
      service.set(true, {
        kind: "device",
        deviceId: "phone-1",
        scopes: ["host.admin"],
      }),
    ).rejects.toThrow("Only this computer");

    expect(await autostartEntries()).toEqual([]);
    expect(await service.enabled()).toBe(false);
  });

  it("reports itself unavailable for a daemon that has no app launcher", async () => {
    const { service } = await linuxService(null);

    expect(await service.status()).toEqual({
      enabled: false,
      available: false,
      registered: false,
    });
    await expect(service.set(true, { kind: "local" })).rejects.toThrow(
      "not available",
    );
  });

  it("rewrites the login item at startup so a moved app keeps launching", async () => {
    const settings = memorySettings();
    const homeDir = await tempDirs.create("cocurdex-background-");
    const userDataPath = path.join(homeDir, "data");
    const target = (launchCommand: string[]) => ({
      platform: "linux" as const,
      launchCommand,
      userDataPath,
      defaultUserDataPath: userDataPath,
      homeDir,
    });
    await new DaemonBackgroundService({
      settings,
      target: target(["/old/cocurdex"]),
    }).set(true, { kind: "local" });

    await new DaemonBackgroundService({
      settings,
      target: target(["/new/cocurdex"]),
    }).reconcile();

    const dir = path.join(homeDir, ".config", "autostart");
    const [entry] = await readdir(dir);
    expect(await readFile(path.join(dir, entry), "utf8")).toContain(
      "Exec=/new/cocurdex --background-daemon",
    );
  });
});
