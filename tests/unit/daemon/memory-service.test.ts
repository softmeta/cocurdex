import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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

function fakeSessions() {
  const chat = fakeSession();
  return new Map<string, SessionRecord>([
    [chat.id, chat],
    ["work-1", { ...chat, id: "work-1", sessionKind: "main", title: "Fix" }],
    ["persona-1", { ...chat, id: "persona-1", sessionKind: "personal" }],
  ]);
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
  options: {
    failRecall?: boolean;
    candidateOnRemember?: boolean;
    identityMissing?: boolean;
    modelInstall?: "ok" | "needsRestart" | "fails";
  } = {},
) {
  const restartMarker = path.join(directory, "runtime-restarted");
  const scriptPath = path.join(directory, "fake-rsrs.mjs");
  const script = `import { appendFileSync, existsSync, writeFileSync } from "node:fs";
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
      session: { user: "local", has_session: false, has_token: false, has_local_keys: ${options.identityMissing !== true} },
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
  if (${options.identityMissing === true}) {
    send({ command: "remember", status: "ok", summary: { action: "skipped", reason: "no local session: rsrs keygen --pass <password> to start fully local (no cloud); or rsrs register / login for a cloud identity" } });
  } else if (${options.candidateOnRemember === true} && args.includes("--force")) {
    send({ command: "remember", status: "ok", summary: { action: "created", id: "forced-memory" } });
  } else if (args.includes("--parent")) {
    send({ command: "remember", status: "ok", summary: { action: "created", id: "attached-memory" } });
  } else if (${options.candidateOnRemember === true}) {
    send({ command: "remember", status: "ok", summary: { action: "candidates" }, details: [{ id: "old-memory", title: "Old memory", score: 0.9 }] });
  } else {
    send({ command: "remember", status: "ok", summary: { action: "created", id: "saved-memory" } });
  }
} else if (command === "runtime" && args[1] === "restart") {
  writeFileSync(${JSON.stringify(restartMarker)}, "");
  send({ command: "runtime.restart", status: "ok" });
} else if (command === "model" && (${JSON.stringify(options.modelInstall)} === "fails" || (${JSON.stringify(options.modelInstall)} === "needsRestart" && !existsSync(${JSON.stringify(restartMarker)})))) {
  send({ command: "cli", status: "fail", errors: ["runtime maintenance is incomplete; use the host runtime restart or the indicated snapshot/login recovery before accessing the library"] });
  process.exit(1);
} else if (command === "doctor") {
  send({ command: "doctor", status: "ok", summary: { total: 1, pass: 1, warn: 0, fail: 0, skip: 0, version: "1.0.0" }, items: [{ name: "store", status: "ok", value: "ok" }] });
} else if (command === "prompt") {
  process.stdout.write("policy text");
} else if (command === "list") {
  send({ command: "list", status: "ok", summary: { count: 2 }, details: [
    { id: "me-1", title: "Prefers tea", content: "Tea, not coffee", importance: "important", project: "cocurdex/me", tags: ["taste"], created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", recall_count: 3 },
    { id: "other-1", title: "Repo note", content: "Use pnpm", importance: "trivial", project: "acme-shop", tags: [] },
  ] });
} else if (command === "history") {
  send({ command: "history", status: "ok", summary: { count: 1 }, details: [
    { entry_id: "me-1", action: "delete", title: "Prefers tea", content: "Tea, not", actor: "test-host", ts: "2026-10-03T00:00:00Z" },
  ] });
} else if (command === "memory-revision") {
  send({ command: "memory-revision", status: "ok", summary: { profile: "/tmp/rsrs", revision: "8c1de196" } });
} else if (command === "forget" && args.includes("missing")) {
  send({ command: "cli", status: "fail", summary: { reason: "runtime_error" }, errors: ["not found #missing"] });
  process.exit(1);
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
      fakeSessions().get(sessionId) ?? null,
    listSessions: async () => [fakeSession()],
    listMessagesBySessionId: async (sessionId: string) =>
      fakeSessions().has(sessionId) ? fakeMessages() : [],
    listWorkspaces: async () => [],
  };
}

async function createService(
  options: {
    failRecall?: boolean;
    candidateOnRemember?: boolean;
    identityMissing?: boolean;
    platform?: { os: string; arch: string };
    turnRecallBudgetMs?: number;
    startRuntime?: boolean;
    userLibraryHome?: string;
    modelInstall?: "ok" | "needsRestart" | "fails";
  } = {},
) {
  const directory = await temp.create("cocurdex-memory-");
  const logPath = path.join(directory, "calls.log");
  const executable = await createFakeRsrs(directory, logPath, options);
  const settings: MemorySettings = {
    enabled: true,
    agent: { injectContext: true, tools: true },
    chat: { recall: true, saveTurns: true, saveOnEnd: true },
    userLibrary: options.userLibraryHome !== undefined,
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
    userLibraryHome: options.userLibraryHome,
    startRuntime: options.startRuntime ?? false,
    installRetryDelaysMs: [0],
    turnRecallBudgetMs: options.turnRecallBudgetMs,
    now: () => new Date("2026-10-28T10:00:02.000Z"),
  });
  return { service, state, logPath, directory };
}

async function startUserRuntime(home: string) {
  const dataDir = path.join(home, ".rsrs");
  const commands: string[][] = [];
  const server = createServer((request, response) => {
    if (request.url === "/api/health") {
      response.end(
        JSON.stringify({ server: "respire", v: 1, data_dir: dataDir }),
      );
      return;
    }
    let text = "";
    request.on("data", (chunk) => {
      text += chunk;
    });
    request.on("end", () => {
      const args = (JSON.parse(text) as { args: string[] }).args;
      commands.push(args);
      const details =
        args[0] === "recall"
          ? [
              { id: "u-1", title: "Recall title", score: 0.95 },
              { id: "u-2", title: "Deploys with bun", score: 0.7 },
            ]
          : {
              entry: {
                id: args[2],
                title: "Deploys with bun",
                content: "The user deploys with bun",
                importance: "important",
                tags: [],
              },
            };
      response.end(
        JSON.stringify({
          ok: true,
          exit: 0,
          envelope: { command: args[0], status: "ok", details },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await mkdir(path.join(dataDir, "runtime"), { recursive: true });
  await writeFile(path.join(dataDir, "session.json"), "{}", "utf8");
  await writeFile(
    path.join(dataDir, "runtime", "endpoint.json"),
    JSON.stringify({ url: `http://127.0.0.1:${port}` }),
    "utf8",
  );
  return { commands, close: () => new Promise((r) => server.close(r)) };
}

describe("MemoryService with a fake rsrs CLI", () => {
  it("adds the user's own rsrs store to recall as read-only reference", async () => {
    const home = await temp.create("cocurdex-user-home-");
    const runtime = await startUserRuntime(home);
    try {
      const { service } = await createService({ userLibraryHome: home });

      expect((await service.getStatus()).userLibrary).toEqual({
        detected: true,
        reachable: true,
      });
      const result = await service.recall({ query: "deploy" });
      expect(result.items.map((item) => item.id)).toEqual([
        "memory-1",
        "user:u-2",
      ]);
      const entry = await service.show("user:u-2");
      expect(entry).toMatchObject({
        id: "user:u-2",
        content: "The user deploys with bun",
      });
      await expect(service.forget("user:u-2")).rejects.toThrow("read-only");
      await expect(
        service.update({ id: "user:u-2", content: "Deploys with pnpm" }),
      ).rejects.toThrow("read-only");
      await expect(
        service.remember({
          title: "Deploys with pnpm",
          content: "The user deploys with pnpm",
          supersedes: ["user:u-2"],
        }),
      ).rejects.toThrow("read-only");
      expect(runtime.commands.map((args) => args[0])).toEqual([
        "recall",
        "show",
      ]);
      expect(runtime.commands[1]).toEqual(["show", "--json", "u-2"]);

      const partitioned = await service.recallIn({ query: "deploy" }, [
        { kind: "me" },
      ]);
      expect(
        partitioned.items.some((item) => item.id.startsWith("user:")),
      ).toBe(false);
      expect(runtime.commands).toHaveLength(2);
    } finally {
      await runtime.close();
    }
  });

  it("does not replay a runtime write through the CLI when its outcome is unconfirmed", async () => {
    let writes = 0;
    const server = createServer((request, response) => {
      if (request.url === "/api/health") {
        response.end(JSON.stringify({ server: "respire", v: 1 }));
        return;
      }
      let text = "";
      request.on("data", (chunk) => {
        text += chunk;
      });
      request.on("end", () => {
        const body = JSON.parse(text);
        if (body.args?.[0] === "remember") writes += 1;
        response.end("not json");
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const { service, directory, logPath } = await createService();
      const { port } = server.address() as AddressInfo;
      await mkdir(path.join(directory, "runtime"), { recursive: true });
      await writeFile(
        path.join(directory, "runtime", "endpoint.json"),
        JSON.stringify({ url: `http://127.0.0.1:${port}` }),
      );
      await expect(
        service.remember({ title: "Tea", content: "Prefers tea" }),
      ).rejects.toThrow("could not be confirmed");
      expect(writes).toBe(1);
      const calls = (await readFile(logPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[]);
      expect(calls.some((call) => call[0] === "remember")).toBe(false);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("warms the embedding path in the background rather than only probing status", async () => {
    const { service, logPath } = await createService({ startRuntime: true });
    await service.initializeOnStartup();
    await service.initializeOnStartup();
    const calls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(calls.filter((call) => call[0] === "recall")).toHaveLength(1);
  });

  it("reports missing local identity without requiring a cloud account", async () => {
    const { service } = await createService({ identityMissing: true });
    const status = await service.getStatus(true);
    expect(status.available).toBe(true);
    expect(status.error).toContain("cocurdex memory install");
    expect(status.cloud.hasKeys).toBe(false);
  });

  it("invalidates a doctor report from a different executable version", async () => {
    const { service, state } = await createService();
    await state.setAppSetting(
      "memory.installState",
      JSON.stringify({
        status: "ready",
        version: "0.9.0",
        doctor: { version: "0.9.0" },
      }),
    );
    const status = await service.getStatus(true);
    expect(status.version).toBe("1.0.0");
    expect(status.doctor).toBeNull();
  });
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

  it("switches to a newly configured rsrs executable", async () => {
    const { service } = await createService();
    await service.list();
    const other = await temp.create("cocurdex-memory-other-");
    const otherLog = path.join(other, "calls.log");
    const otherExecutable = await createFakeRsrs(other, otherLog);
    await service.setSettings({
      ...(await service.getSettings()),
      cliPath: otherExecutable,
    });
    await service.list();
    const calls = (await readFile(otherLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(calls.some((call) => call[0] === "list")).toBe(true);
  });

  it("reads the library through the rsrs CLI", async () => {
    const { service, logPath } = await createService();
    const mine = await service.list({ partition: { kind: "me" } });
    expect(mine).toEqual({
      error: null,
      items: [
        expect.objectContaining({
          id: "me-1",
          content: "Tea, not coffee",
          project: "cocurdex/me",
          tags: ["taste"],
          updatedAt: "2026-10-02T00:00:00Z",
        }),
      ],
    });
    expect(await service.history({ id: "me-1" })).toEqual([
      {
        entryId: "me-1",
        action: "delete",
        title: "Prefers tea",
        excerpt: "Tea, not",
        actor: "test-host",
        at: "2026-10-03T00:00:00Z",
      },
    ]);
    expect(await service.revision()).toBe("8c1de196");
    await expect(service.forget("missing")).rejects.toThrow(
      "not found #missing",
    );
    const calls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(calls).toContainEqual([
      "history",
      "--json",
      "me-1",
      "--limit",
      "50",
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

  it("keeps one diary per session and leaves it out of that session's recall", async () => {
    const { service, state, logPath } = await createService();
    await service.getStatus();
    await state.setAppSetting(
      "memory.captures",
      JSON.stringify({
        "chat-1": {
          provider: "rsrs",
          memoryId: "memory-1",
          savedAt: "2026-10-28T09:00:00.000Z",
          lastAssistantMessageId: "earlier",
          kind: "turn",
        },
      }),
    );
    expect(await service.captureTurn("chat-1", "a1")).toMatchObject({
      saved: true,
      memoryId: "memory-1",
    });
    const calls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(calls.some((args) => args[0] === "remember")).toBe(false);
    expect(calls.find((args) => args[0] === "update")).toContain("memory-1");
    expect(
      await service.buildTurnContext(fakeSession(), "hi", "chat"),
    ).toBeNull();
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

  it("stores the session summary on its own instead of claiming a similar memory as its cause", async () => {
    const { service, logPath } = await createService({
      candidateOnRemember: true,
    });
    await service.getStatus();
    const result = await service.saveSession({ sessionId: "chat-1" });
    expect(result).toMatchObject({ saved: true, memoryId: "forced-memory" });
    const rememberCalls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[])
      .filter((args) => args[0] === "remember");
    expect(rememberCalls).toHaveLength(2);
    expect(rememberCalls[1]).toContain("--force");
    expect(rememberCalls[1]).not.toContain("--parent");
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

  it("recalls through the CLI without waiting for a runtime that never starts", async () => {
    const { service, logPath } = await createService({ startRuntime: true });
    await service.getStatus();
    const startedAt = performance.now();

    const context = await service.buildTurnContext(
      fakeSession(),
      "anything",
      "chat",
    );

    expect(performance.now() - startedAt).toBeLessThan(5_000);
    expect(context).not.toBeNull();
    const calls = (await readFile(logPath, "utf8")).trim().split("\n");
    expect(calls.some((line) => line.startsWith('["recall"'))).toBe(true);
  });

  it("keeps a slow runtime and skips the CLI once the turn budget is spent", async () => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/api/health") {
        requests.push("health");
        response.end(JSON.stringify({ server: "respire", v: 1 }));
        return;
      }
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const { args } = JSON.parse(body);
        requests.push(args[0]);
        setTimeout(
          () =>
            response.end(
              JSON.stringify({ v: 1, ok: true, exit: 0, envelope: {} }),
            ),
          1_000,
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const { service, logPath, directory } = await createService({
        turnRecallBudgetMs: 200,
      });
      const { port } = server.address() as AddressInfo;
      const runtimeDir = path.join(directory, "runtime");
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(
        path.join(runtimeDir, "endpoint.json"),
        JSON.stringify({ url: `http://127.0.0.1:${port}` }),
      );
      await service.getStatus();
      const probes = () => requests.filter((name) => name === "health").length;
      const recall = () =>
        service.buildTurnContext(fakeSession(), "anything", "chat");
      expect(await recall()).toBeNull();
      const probesAfterFirstTurn = probes();
      expect(await recall()).toBeNull();
      expect(probes()).toBe(probesAfterFirstTurn);
      expect(requests.filter((name) => name === "recall")).toHaveLength(2);
      expect((await service.getStatus()).lastRecall).toMatchObject({
        outcome: "failed",
        error: expect.stringContaining("timed out"),
      });
      const calls = (await readFile(logPath, "utf8")).trim().split("\n");
      expect(calls.some((line) => line.startsWith('["recall"'))).toBe(false);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("stops recalling and capturing when the switch is off", async () => {
    const { service } = await createService();
    await service.getStatus();
    const settings = await service.getSettings();
    await service.setSettings({ ...settings, enabled: false });
    expect(await service.recall({ query: "cocurdex" })).toMatchObject({
      items: [],
      error: expect.stringContaining("cocurdex memory on"),
    });
    expect(await service.captureTurn("chat-1", "a1")).toMatchObject({
      saved: false,
      reason: "disabled",
    });
  });

  it("tells the agent how to register when rsrs has no identity", async () => {
    const { service } = await createService({ identityMissing: true });
    await service.getStatus();
    const result = await service.remember({
      content: "【前因】a\n【行为】b\n【后果】c",
      title: "A title",
    });
    expect(result.action).toBe("skipped");
    expect(result.message).toContain("no local session");
    expect(result.message).toContain("cocurdex memory cloud register");
  });

  it("captures a work session's turn in the background but leaves assistants to their own judgment", async () => {
    const { service, logPath } = await createService();
    await service.getStatus();
    expect(await service.captureTurn("work-1", "a1")).toMatchObject({
      saved: true,
    });
    expect(await service.captureTurn("persona-1", "a1")).toMatchObject({
      saved: false,
      reason: "not-captured",
    });
    const remembers = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[])
      .filter((args) => args[0] === "remember");
    expect(remembers).toHaveLength(1);
    expect(remembers[0].join(" ")).toContain("Cocurdex session：Fix");
  });

  it("restarts the runtime after interrupted maintenance and finishes the install", async () => {
    const { service, logPath } = await createService({
      modelInstall: "needsRestart",
    });
    const install = await service.install(true);
    expect(install).toMatchObject({ installed: true, message: null });
    expect(install.status.installation).toBe("ready");
    const calls = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    const steps = calls
      .filter((args) => args[0] === "model" || args[1] === "restart")
      .map((args) => args.slice(0, 2).join(" "));
    expect(steps).toEqual([
      "model install",
      "runtime restart",
      "model install",
    ]);
  });

  it("reports an install that keeps failing as failed although the CLI is present", async () => {
    const { service } = await createService({ modelInstall: "fails" });
    const install = await service.install(true);
    expect(install.installed).toBe(false);
    const status = await service.getStatus(true);
    expect(status.installation).toBe("failed");
    expect(status.error).toContain("runtime maintenance is incomplete");
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

  it("injects the memory policy into the agent catalog while memory is enabled", async () => {
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
    expect(catalog.instructions ?? "").toContain("memory_remember");

    const settings = await service.getSettings();
    await service.setSettings({ ...settings, enabled: false });
    const disabledCatalog = await bridge.catalog(binding.binding.token);
    expect(disabledCatalog.tools).toEqual([]);
    expect(disabledCatalog.instructions).toBeUndefined();
  });
});
