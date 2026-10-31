import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MemoryService } from "@cocurdex/daemon/internal/memory/service";
import type { MemorySettings } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const temp = createTempDirs();

afterAll(() => temp.cleanup());

interface FakeOptions {
  loginExit?: number;
  loginStderr?: string;
  registerExit?: number;
  registerStderr?: string;
}

const DEFAULT_STATE = {
  user: null,
  hasToken: false,
  autosync: false,
  pending: 0,
  conflicts: 0,
};

async function createFakeRsrs(directory: string, options: FakeOptions = {}) {
  const statePath = path.join(directory, "rsrs-state.json");
  const logPath = path.join(directory, "calls.log");
  await writeFile(statePath, JSON.stringify(DEFAULT_STATE), "utf8");
  const scriptPath = path.join(directory, "fake-rsrs.mjs");
  const script = `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const log = ${JSON.stringify(logPath)};
const statePath = ${JSON.stringify(statePath)};
const options = ${JSON.stringify(options)};
const args = process.argv.slice(2);
appendFileSync(log, JSON.stringify(args) + "\\n");
const command = args[0];
const send = (value) => process.stdout.write(JSON.stringify(value));
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? "" : null;
};
const readState = () => {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return { ...${JSON.stringify(DEFAULT_STATE)} };
  }
};
const writeState = (next) => writeFileSync(statePath, JSON.stringify(next));
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
} else if (command === "config") {
  writeState({ ...readState(), autosync: flag("--autosync") === "true" });
  send({ command: "config", status: "ok" });
} else if (command === "register") {
  if (options.registerExit) {
    process.stderr.write(options.registerStderr ?? "register failed");
    process.exit(options.registerExit);
  }
  const user = flag("--user");
  writeState({ ...readState(), user, hasToken: true, autosync: true });
  send({
    command: "register",
    status: "ok",
    summary: { ok: true, user, addr: "https://api.rsrs.rs", super: "A3-test-super" },
  });
} else if (command === "login") {
  if (options.loginExit) {
    process.stderr.write(options.loginStderr ?? "login failed");
    process.exit(options.loginExit);
  }
  const user = flag("--user");
  writeState({ ...readState(), user, hasToken: true, autosync: true });
  send({
    command: "login",
    status: "ok",
    summary: { ok: true, user, addr: "https://api.rsrs.rs", super_issued: null },
  });
} else if (command === "logout") {
  writeState({ ...readState(), hasToken: false });
  send({ command: "logout", status: "ok" });
} else if (command === "keys-export") {
  send({
    command: "keys-export",
    status: "warn",
    items: [{ name: "content", status: "warn", value: "super: A3-test-super" }],
  });
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
  return { executable: wrapperPath, logPath, statePath };
}

async function createService(options: FakeOptions = {}) {
  const directory = await temp.create("cocurdex-memory-cloud-");
  const fake = await createFakeRsrs(directory, options);
  const settings: MemorySettings = {
    enabled: true,
    agent: { injectContext: true, tools: true },
    chat: { recall: true, saveTurns: true, saveOnEnd: true },
    cliPath: fake.executable,
  };
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
  return { service, logPath: fake.logPath, statePath: fake.statePath, values };
}

async function calls(logPath: string) {
  const raw = await readFile(logPath, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

describe("MemoryService cloud sync", () => {
  it("is off by default and refuses to enable sync without an account", async () => {
    const { service } = await createService();
    const status = await service.getStatus();
    expect(status.cloud.connected).toBe(false);
    expect(status.cloud.user).toBeNull();
    expect(status.cloud.autosync).toBe(false);
    await expect(service.setCloudSync(true)).rejects.toThrow(
      "Connect an rsrs account",
    );
  });

  it("registers an account, keeps the recovery key out of stored settings, and turns sync on", async () => {
    const { service, logPath, values } = await createService();
    const result = await service.connectCloud({
      mode: "register",
      user: "alice",
      password: "password123",
    });

    expect(result.recoveryKey).toBe("A3-test-super");
    expect(result.status.cloud).toMatchObject({
      connected: true,
      user: "alice",
      server: "https://api.rsrs.rs",
      autosync: true,
    });

    const recorded = await calls(logPath);
    const register = recorded.find((args) => args[0] === "register");
    expect(register).toEqual([
      "register",
      "--json",
      "--user",
      "alice",
      "--pass",
      "password123",
    ]);
    expect(
      recorded.some(
        (args) => args[0] === "config" && args.includes("--autosync"),
      ),
    ).toBe(true);

    const stored = values.get("memory") ?? "";
    expect(stored).not.toContain("password123");
    expect(stored).not.toContain("A3-test-super");
  });

  it("surfaces a duplicate account error without leaking the password", async () => {
    const { service } = await createService({
      registerExit: 1,
      registerStderr:
        'ERROR: user "alice" is already registered; password password123 rejected',
    });
    let failure: unknown = null;
    try {
      await service.connectCloud({
        mode: "register",
        user: "alice",
        password: "password123",
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain("already registered");
    expect(message).toContain("[redacted]");
    expect(message).not.toContain("password123");

    const status = await service.getStatus();
    expect(status.cloud.connected).toBe(false);
  });

  it("signs in to an existing account with the recovery key", async () => {
    const { service, logPath } = await createService();
    const result = await service.connectCloud({
      mode: "signin",
      user: "bob",
      password: "password123",
      recoveryKey: "A3-abc-def",
    });
    expect(result.recoveryKey).toBeNull();
    expect(result.status.cloud.connected).toBe(true);
    const login = (await calls(logPath)).find((args) => args[0] === "login");
    expect(login).toEqual([
      "login",
      "--json",
      "--interactive",
      "--user",
      "bob",
      "--pass",
      "password123",
      "--super",
      "A3-abc-def",
    ]);
  });

  it("requires a recovery key before signing in", async () => {
    const { service, logPath } = await createService();
    await expect(
      service.connectCloud({
        mode: "signin",
        user: "bob",
        password: "password123",
      }),
    ).rejects.toThrow("recovery key");
    const recorded = await calls(logPath).catch(() => [] as string[][]);
    expect(recorded.some((args) => args[0] === "login")).toBe(false);
  });

  it("validates the username and password before calling rsrs", async () => {
    const { service } = await createService();
    await expect(
      service.connectCloud({
        mode: "register",
        user: "ab",
        password: "password123",
      }),
    ).rejects.toThrow("at least 3 characters");
    await expect(
      service.connectCloud({
        mode: "register",
        user: "alice",
        password: "short",
      }),
    ).rejects.toThrow("at least 8 characters");
  });

  it("toggles automatic sync only while an account is connected", async () => {
    const { service, logPath, statePath } = await createService();
    await service.connectCloud({
      mode: "register",
      user: "alice",
      password: "password123",
    });
    const off = await service.setCloudSync(false);
    expect(off.cloud.autosync).toBe(false);
    expect(JSON.parse(await readFile(statePath, "utf8")).autosync).toBe(false);

    const on = await service.setCloudSync(true);
    expect(on.cloud).toMatchObject({ connected: true, autosync: true });

    const configCalls = (await calls(logPath)).filter(
      (args) => args[0] === "config",
    );
    expect(configCalls.at(-1)).toEqual([
      "config",
      "--autosync",
      "true",
      "--json",
    ]);
  });

  it("disconnects without touching the stored settings", async () => {
    const { service, logPath, values } = await createService();
    await service.connectCloud({
      mode: "register",
      user: "alice",
      password: "password123",
    });
    const before = values.get("memory");
    const status = await service.disconnectCloud();
    expect(status.cloud.connected).toBe(false);
    expect((await calls(logPath)).some((args) => args[0] === "logout")).toBe(
      true,
    );
    expect(values.get("memory")).toBe(before);
  });

  it("exports the recovery keys on demand", async () => {
    const { service } = await createService();
    await service.connectCloud({
      mode: "register",
      user: "alice",
      password: "password123",
    });
    await expect(service.cloudKeys()).resolves.toEqual({
      content: "super: A3-test-super",
    });
  });

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
