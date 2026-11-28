import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { MemoryService } from "@cocurdex/daemon/internal/memory/service";
import { normalizeMemorySettings } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const temp = createTempDirs();

afterAll(() => temp.cleanup());

const DEFAULT_STATE = {
  user: null,
  hasToken: false,
  autosync: false,
  pending: 0,
  conflicts: 0,
};

async function createFakeRsrs(directory: string) {
  const statePath = path.join(directory, "rsrs-state.json");
  await writeFile(statePath, JSON.stringify(DEFAULT_STATE), "utf8");
  const scriptPath = path.join(directory, "fake-rsrs.mjs");
  const script = `import { readFileSync } from "node:fs";
const statePath = ${JSON.stringify(statePath)};
const command = process.argv[2];
const send = (value) => process.stdout.write(JSON.stringify(value));
const readState = () => {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return { ...${JSON.stringify(DEFAULT_STATE)} };
  }
};
const statusSummary = (state) => ({
  command: "status",
  status: "ok",
  summary: {
    data_dir: "/tmp/rsrs",
    server_addr: "https://api.rsrs.rs",
    autosync: state.autosync === true,
    offline: state.offline === true,
    remote_configured: true,
    session: {
      user: state.user ?? "local",
      has_session: Boolean(state.user),
      has_token: state.hasToken === true,
      has_local_keys: true,
    },
    sync_live: {
      phase: "ok",
      pending: state.pending ?? 0,
      conflicts: state.conflicts ?? 0,
      error: "",
    },
    sync_scheduler: { last_success_unix: 1793373504, state: "scheduled" },
  },
});
if (command === "--version") {
  process.stdout.write("rsrs 1.9.9\\n");
} else if (command === "status") {
  send(statusSummary(readState()));
} else {
  send({ command, status: "ok" });
}
`;
  await writeFile(scriptPath, script, "utf8");
  const wrapperPath =
    process.platform === "win32"
      ? path.join(directory, "fake-rsrs.cmd")
      : path.join(directory, "fake-rsrs.sh");
  const wrapper =
    process.platform === "win32"
      ? `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`;
  await writeFile(wrapperPath, wrapper, "utf8");
  if (process.platform !== "win32") await chmod(wrapperPath, 0o755);
  return { executable: wrapperPath, statePath };
}

async function createService() {
  const directory = await temp.create("cocurdex-memory-cloud-");
  const fake = await createFakeRsrs(directory);
  const settings = normalizeMemorySettings({
    enabled: true,
    rsrs: true,
    agent: { injectContext: true, tools: true },
    chat: { recall: true, saveTurns: true, saveOnEnd: true },
    userLibrary: false,
    cliPath: fake.executable,
  });
  const values = new Map<string, string>([
    ["memory", JSON.stringify(settings)],
  ]);
  const state = {
    getAppSetting: async (key: string) => values.get(key) ?? null,
    setAppSetting: async (key: string, value: string) => {
      values.set(key, value);
    },
    getSession: async () => null,
    listSessions: async () => [],
    listMessagesBySessionId: async () => [],
    listWorkspaces: async () => [],
  };
  const service = new MemoryService({
    userDataPath: directory,
    state: state as never,
    broadcast: () => {},
    resolveSessionProvider: async () => null,
    device: "test-host",
    rsrsDataDir: directory,
    startRuntime: false,
    now: () => new Date("2026-10-31T10:00:00.000Z"),
  });
  return { service, statePath: fake.statePath };
}

describe("MemoryService cloud status from rsrs", () => {
  it("reports sync progress from the rsrs status payload", async () => {
    const { service, statePath } = await createService();
    await writeFile(
      statePath,
      JSON.stringify({
        user: "alice",
        hasToken: true,
        autosync: true,
        pending: 3,
        conflicts: 2,
      }),
      "utf8",
    );
    const status = await service.getStatus(true);
    expect(status.cloud).toEqual({
      connected: true,
      user: "alice",
      server: "https://api.rsrs.rs",
      autosync: true,
      hasKeys: true,
      offline: false,
      syncing: false,
      pending: 3,
      conflicts: 2,
      lastSyncAt: new Date(1793373504 * 1000).toISOString(),
      error: null,
    });
    expect(status.account).toBe("alice");
    expect(status.dataDir).toBe("/tmp/rsrs");
  });

  it("reports an account whose session has no token as disconnected", async () => {
    const { service, statePath } = await createService();
    await writeFile(
      statePath,
      JSON.stringify({ ...DEFAULT_STATE, user: "alice", hasToken: false }),
      "utf8",
    );
    const status = await service.getStatus(true);
    expect(status.cloud.connected).toBe(false);
    expect(status.cloud.user).toBe("alice");
  });

  it("keeps the account connected while the device is offline", async () => {
    const { service, statePath } = await createService();
    await writeFile(
      statePath,
      JSON.stringify({
        user: "alice",
        hasToken: true,
        autosync: true,
        offline: true,
      }),
      "utf8",
    );
    const status = await service.getStatus(true);
    expect(status.cloud).toMatchObject({
      connected: true,
      offline: true,
      user: "alice",
      autosync: true,
    });
  });
});
