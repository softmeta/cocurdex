import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AgentToolBridge } from "@cocurdex/daemon/internal/agent-tools/agent-tool-bridge";
import { registerMemoryTools } from "@cocurdex/daemon/internal/agent-tools/groups/memory";
import { MemoryService } from "@cocurdex/daemon/internal/memory/service";
import type {
  MemorySettings,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const temp = createTempDirs();

afterAll(() => temp.cleanup());

function fakeSession(): SessionRecord {
  const now = "2026-10-28T10:00:00.000Z";
  return {
    id: "chat-1",
    workspaceId: "chat",
    title: "Test chat",
    agentType: "pi",
    sessionKind: "chat",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    archivedAt: null,
    providerSnapshot: null,
    worktreePath: null,
    peerInbound: "refuse",
  };
}

function fakeMessages(): MessageRecord[] {
  return [
    {
      id: "u1",
      sessionId: "chat-1",
      role: "user",
      content: "How do I run Cocurdex?",
      attachments: [],
      createdAt: "2026-10-28T10:00:00.000Z",
    },
    {
      id: "a1",
      sessionId: "chat-1",
      role: "assistant",
      content: "Use pnpm dev.",
      attachments: [],
      createdAt: "2026-10-28T10:00:01.000Z",
    },
  ];
}

async function createFakeRsrs(
  directory: string,
  logPath: string,
  options: { failRecall?: boolean; candidateOnRemember?: boolean } = {},
) {
  const scriptPath = path.join(directory, "fake-rsrs.mjs");
  const script = `import { appendFileSync } from "node:fs";
const log = ${JSON.stringify(logPath)};
const args = process.argv.slice(2);
appendFileSync(log, JSON.stringify(args) + "\\n");
const command = args[0];
const send = (value) => process.stdout.write(JSON.stringify(value));
if (command === "--version") {
  process.stdout.write("rsrs 1.0.0\\n");
} else if (command === "v") {
  process.stdout.write("rsrs 1.0.0\\n");
} else if (command === "status") {
  send({
    command: "status",
    status: "ok",
    summary: {
      data_dir: "/tmp/rsrs",
      server_addr: "https://api.rsrs.rs",
      autosync: false,
      offline: false,
      remote_configured: true,
      session: { user: "local", has_session: false, has_token: false, has_local_keys: false },
      sync_live: { phase: "ok", pending: 0, conflicts: 0, error: "" },
    },
  });
} else if (command === "config") {
  send({ command: "config", status: "ok", summary: { data_dir: "/tmp/rsrs", addr: "https://api.rsrs.rs" } });
} else if (command === "recall") {
  ${
    options.failRecall
      ? `process.stderr.write("rsrs recall timed out after 2000ms\\n"); process.exit(1);`
      : `send({ command: "recall", status: "ok", details: [{ id: "memory-1", title: "Recall title", score: 0.8 }] });`
  }
} else if (command === "show") {
  send({ command: "show", status: "ok", details: { entry: { id: args[1], title: "Recall title", content: "Recall body", importance: "important", tags: [] } } });
} else if (command === "remember") {
  if (args.includes("--parent")) {
    send({ command: "remember", status: "ok", summary: { action: "created", id: "attached-memory" } });
  } else if (${options.candidateOnRemember === true}) {
    send({ command: "remember", status: "ok", summary: { action: "candidates" }, details: [{ id: "old-memory", title: "Old memory", score: 0.9 }] });
  } else {
    send({ command: "remember", status: "ok", summary: { action: "created", id: "saved-memory" } });
  }
} else if (command === "doctor") {
  send({ command: "doctor", status: "ok", summary: { total: 1, pass: 1, warn: 0, fail: 0, skip: 0, version: "1.0.0" }, items: [{ name: "store", status: "ok", value: "ok" }] });
} else if (command === "prompt") {
  process.stdout.write("policy text");
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
  if (process.platform !== "win32") {
    await chmod(wrapperPath, 0o755);
  }
  return wrapperPath;
}

function createState(settings: MemorySettings) {
  const values = new Map<string, string>([
    ["memory", JSON.stringify(settings)],
  ]);
  return {
    getAppSetting: async (key: string) => values.get(key) ?? null,
    setAppSetting: async (key: string, value: string) => {
      values.set(key, value);
    },
    getSession: async (sessionId: string) =>
      sessionId === "chat-1" ? fakeSession() : null,
    listSessions: async () => [fakeSession()],
    listMessagesBySessionId: async (sessionId: string) =>
      sessionId === "chat-1" ? fakeMessages() : [],
    listWorkspaces: async () => [],
  };
}

async function createService(
  options: {
    failRecall?: boolean;
    candidateOnRemember?: boolean;
    platform?: { os: string; arch: string };
  } = {},
) {
  const directory = await temp.create("cocurdex-memory-");
  const logPath = path.join(directory, "calls.log");
  const executable = await createFakeRsrs(directory, logPath, options);
  const settings: MemorySettings = {
    enabled: true,
    agent: { injectContext: true, tools: true },
    chat: { recall: true, saveTurns: true, saveOnEnd: true },
    cliPath: executable,
  };
  const state = createState(settings);
  const service = new MemoryService({
    userDataPath: directory,
    state: state as never,
    broadcast: () => {},
    resolveSessionProvider: async () => null,
    device: "test-host",
    platform: options.platform,
    rsrsDataDir: directory,
    startRuntime: false,
    now: () => new Date("2026-10-28T10:00:02.000Z"),
  });
  return { service, state, logPath, directory };
}

describe("MemoryService with a fake rsrs CLI", () => {
  it("reports status and recalls memories", async () => {
    const { service } = await createService();
    const status = await service.getStatus();
    expect(status.available).toBe(true);
    expect(status.version).toBe("1.0.0");
    expect(status.dataDir).toBe("/tmp/rsrs");
    expect(status.cloud.connected).toBe(false);

    const result = await service.recall({ query: "cocurdex" });
    expect(result.items).toEqual([
      {
        id: "memory-1",
        title: "Recall title",
        score: 0.8,
        importance: null,
        updatedAt: null,
      },
    ]);
  });

  it("builds a chat brief with excerpts", async () => {
    const { service } = await createService();
    await service.getStatus();
    const context = await service.buildTurnContext(
      fakeSession(),
      "How do I run Cocurdex?",
      "chat",
    );
    expect(context?.brief).toContain("<memory-context");
    expect(context?.brief).toContain("memory-1");
    expect(context?.brief).toContain("Recall body");
  });

  it("captures a chat turn as a trivial diary entry", async () => {
    const { service, logPath } = await createService();
    await service.getStatus();
    const result = await service.captureTurn("chat-1", "a1");
    expect(result).toMatchObject({ saved: true, memoryId: "saved-memory" });
    const log = await readFile(logPath, "utf8");
    expect(log).toContain('"remember"');
    expect(log).toContain("--importance");
    expect(log).toContain("trivial");
  });

  it("stores a manual session save as important and lets rsrs judge it", async () => {
    const { service, logPath } = await createService();
    await service.getStatus();
    const result = await service.saveSession({
      sessionId: "chat-1",
      importance: "important",
    });
    expect(result).toMatchObject({ saved: true, memoryId: "saved-memory" });
    const calls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    const remember = calls.find((args) => args[0] === "remember");
    expect(remember).toContain("--importance");
    expect(remember).toContain("important");
    expect(remember).not.toContain("--force");
  });

  it("attaches the session summary under the closest memory instead of duplicating it", async () => {
    const { service, logPath } = await createService({
      candidateOnRemember: true,
    });
    await service.getStatus();
    const result = await service.saveSession({ sessionId: "chat-1" });
    expect(result).toMatchObject({ saved: true, memoryId: "attached-memory" });
    const rememberCalls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[])
      .filter((args) => args[0] === "remember");
    expect(rememberCalls).toHaveLength(2);
    expect(rememberCalls[1]).toContain("--parent");
    expect(rememberCalls[1]).toContain("old-memory");
  });

  it("records a failed turn recall so clients can surface it", async () => {
    const { service } = await createService({ failRecall: true });
    await service.getStatus();
    expect(
      await service.buildTurnContext(fakeSession(), "anything", "chat"),
    ).toBeNull();
    const status = await service.getStatus();
    expect(status.lastRecall).toMatchObject({
      sessionId: "chat-1",
      mode: "chat",
      outcome: "failed",
    });
    expect(status.lastRecall?.error).toBeTruthy();
  });

  it("stops recalling and capturing when the switch is off", async () => {
    const { service } = await createService();
    await service.getStatus();
    const settings = await service.getSettings();
    await service.setSettings({ ...settings, enabled: false });
    expect(await service.recall({ query: "cocurdex" })).toMatchObject({
      items: [],
    });
    expect(await service.captureTurn("chat-1", "a1")).toMatchObject({
      saved: false,
      reason: "disabled",
    });
  });

  it("nudges the next turn when the store gate was missed", async () => {
    const { service } = await createService();
    await service.getStatus();
    expect(
      await service.beginTurn({
        sessionId: "agent-1",
        mode: "agent",
        enforce: true,
      }),
    ).toBeNull();
    expect(
      await service.finishTurn({ sessionId: "agent-1", enforce: true }),
    ).toBe(true);
    expect(
      await service.beginTurn({
        sessionId: "agent-1",
        mode: "agent",
        enforce: true,
      }),
    ).toContain("Gate 2 (store) was missed");
    expect(
      await service.beginTurn({
        sessionId: "agent-1",
        mode: "agent",
        enforce: true,
      }),
    ).toBeNull();
  });

  it("clears the gate when the turn stored something", async () => {
    const { service } = await createService();
    await service.getStatus();
    await service.beginTurn({
      sessionId: "agent-2",
      mode: "agent",
      enforce: true,
    });
    service.noteGateToolUse("agent-2", "remember");
    expect(
      await service.finishTurn({ sessionId: "agent-2", enforce: true }),
    ).toBe(false);
    expect(
      await service.beginTurn({
        sessionId: "agent-2",
        mode: "agent",
        enforce: true,
      }),
    ).toBeNull();
  });

  it("does not enforce gates for chat or subagent turns", async () => {
    const { service } = await createService();
    await service.getStatus();
    expect(
      await service.beginTurn({
        sessionId: "chat-1",
        mode: "chat",
        enforce: false,
      }),
    ).toBeNull();
    expect(
      await service.finishTurn({ sessionId: "chat-1", enforce: true }),
    ).toBe(false);
    expect(
      await service.beginTurn({
        sessionId: "sub-1",
        mode: "agent",
        enforce: false,
      }),
    ).toBeNull();
    expect(
      await service.finishTurn({ sessionId: "sub-1", enforce: false }),
    ).toBe(false);
  });

  it("does not enforce gates when the switch is off", async () => {
    const { service } = await createService();
    await service.getStatus();
    const settings = await service.getSettings();
    await service.setSettings({ ...settings, enabled: false });
    expect(
      await service.beginTurn({
        sessionId: "agent-3",
        mode: "agent",
        enforce: true,
      }),
    ).toBeNull();
    expect(
      await service.finishTurn({ sessionId: "agent-3", enforce: true }),
    ).toBe(false);
    service.noteGateToolUse("agent-3", "remember");
    expect(service.agentInstructions(true)).toBe("");
  });

  it("keeps memory off where the rsrs CLI has no build", async () => {
    const { service } = await createService({
      platform: { os: "darwin", arch: "x64" },
    });
    const settings = await service.getSettings();
    expect(settings.enabled).toBe(false);
    const status = await service.getStatus();
    expect(status).toMatchObject({ supported: false, enabled: false });
    expect(await service.recall({ query: "cocurdex" })).toMatchObject({
      items: [],
    });
    const install = await service.install();
    expect(install.installed).toBe(false);
    expect(install.message).toContain("darwin/x64");
    expect(
      (await service.setSettings({ ...settings, enabled: true })).enabled,
    ).toBe(false);
  });

  it("injects the gates into the agent catalog while memory is enabled", async () => {
    const { service } = await createService();
    await service.getStatus();
    const session = { ...fakeSession(), sessionKind: "main" as const };
    const bridge = new AgentToolBridge({
      url: "http://127.0.0.1:1/mcp",
      getSession: async () => session as never,
      memoryInstructions: (hasMemoryTools) =>
        hasMemoryTools ? service.agentInstructions(true) : undefined,
    });
    registerMemoryTools(bridge.registry, {
      isEnabled: () => service.areToolsEnabledSync(),
      recall: (input) => service.recall(input),
      show: (id) => service.show(id),
      remember: (input) => service.remember(input),
      policy: () => service.policy(),
    });
    const binding = bridge.bind({ id: session.id });
    if (!binding) throw new Error("expected a session binding");
    const catalog = await bridge.catalog(binding.binding.token);
    expect(catalog.tools.map((tool) => tool.name)).toContain("remember");
    expect(catalog.instructions ?? "").toContain(
      "Gate 1 - recall before acting.",
    );
    expect(catalog.instructions ?? "").toContain(
      "Gate 2 - store before replying.",
    );

    const settings = await service.getSettings();
    await service.setSettings({ ...settings, enabled: false });
    const disabledCatalog = await bridge.catalog(binding.binding.token);
    expect(disabledCatalog.tools).toEqual([]);
    expect(disabledCatalog.instructions).toBeUndefined();
  });
});
