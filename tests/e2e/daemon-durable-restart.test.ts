import { DatabaseSync } from "node:sqlite";
import {
  closeDurableHosts,
  DURABLE_TABLE_PREFIX,
  killProcessTree,
  listDurableInFlightInputs,
  useDurableStore,
} from "@cocurdex/agent-adapters";
import { requestDaemon } from "@cocurdex/daemon/client";
import { getDatabasePath } from "@cocurdex/daemon/paths";
import { createCocurdexDatabase } from "@cocurdex/db";
import type { MessageRecord, SessionKind } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  saveStubProvider,
  startChatSession,
} from "@cocurdex/test-harness/helpers/chat-session";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import {
  type StubLlmServer,
  startStubLlmServer,
} from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

function dropDurableTables(userDataPath: string) {
  const database = new DatabaseSync(getDatabasePath(userDataPath));
  try {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE ?",
      )
      .all(`${DURABLE_TABLE_PREFIX}%`)
      .map((row) => String(row.name));
    for (const table of tables) database.exec(`DROP TABLE "${table}"`);
  } finally {
    database.close();
  }
}

async function crash(daemon: DaemonProcess) {
  if (process.platform === "win32" && daemon.child.pid) {
    await killProcessTree(daemon.child.pid);
  } else {
    daemon.child.kill("SIGKILL");
  }
  await daemon.exit;
}

async function snapshot(daemon: DaemonProcess, sessionId: string) {
  const result = await requestDaemon(
    "session.snapshot",
    { sessionId },
    daemon.options,
  );
  if (!result) throw new Error(`Session ${sessionId} was not found`);
  return result;
}

async function waitForResponses(
  daemon: DaemonProcess,
  sessionId: string,
  count: number,
) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await snapshot(daemon, sessionId);
    if (responses(state.messages).length >= count && !state.activeRun) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${count} answers`);
}

function waitForAnswer(daemon: DaemonProcess, sessionId: string) {
  return waitForResponses(daemon, sessionId, 1);
}

async function startWorkSession(
  daemon: DaemonProcess,
  stub: StubLlmServer,
  rootPath: string,
  sessionKind: SessionKind,
) {
  const providerSnapshot = await saveStubProvider(daemon, stub);
  const now = new Date().toISOString();
  await requestDaemon(
    "workspace.save",
    {
      workspace: {
        id: "durable-workspace",
        name: "durable-workspace",
        rootPaths: [rootPath],
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        sortOrder: 1000,
      },
    },
    daemon.options,
  );
  return requestDaemon(
    "session.configure",
    {
      id: crypto.randomUUID(),
      workspaceId: "durable-workspace",
      sessionKind,
      title: `Work ${sessionKind}`,
      agentType: "pi",
      writeMode: "read-only",
      sessionModeId: null,
      providerSnapshot,
    },
    daemon.options,
  );
}

async function waitForScriptRun(daemon: DaemonProcess, runId: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { run } = await requestDaemon(
      "scriptRun.get",
      { runId },
      daemon.options,
    );
    if (run.status === "completed") return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Script run ${runId} never completed`);
}

function responses(messages: MessageRecord[]) {
  return messages.filter(
    (message) => message.role === "assistant" && message.kind === "response",
  );
}

describe("durable assistant and chat runs across daemon restarts", () => {
  it("finishes a chat answer the daemon crashed in", async () => {
    const stub = await startStubLlmServer();
    const userDataPath = tempDirs.createSync("cocu-durable-");
    let daemon = await spawnDaemon({ userDataPath });
    try {
      const session = await startChatSession(daemon, stub);
      stub.plan = { kind: "hang" };
      const messageId = crypto.randomUUID();
      await requestDaemon(
        "session.send",
        { sessionId: session.id, messageId, content: "Are you still there?" },
        daemon.options,
      );
      await stub.nextRequest();
      await crash(daemon);

      stub.plan = { kind: "stream", chunks: ["Still", " here"] };
      daemon = await spawnDaemon({ userDataPath });
      const state = await waitForAnswer(daemon, session.id);
      expect(
        responses(state.messages).map((message) => message.content),
      ).toEqual(["Still here"]);
      expect(
        state.messages.filter((message) => message.role === "user"),
      ).toHaveLength(1);
      expect(state.messages.some((message) => message.role === "system")).toBe(
        false,
      );
      const lastRequest = stub.requests.at(-1);
      expect(JSON.stringify(lastRequest?.body.messages)).toContain(
        "Are you still there?",
      );
    } finally {
      await daemon.stop();
      await stub.close();
    }
  });

  it("continues a chat answer after a graceful daemon restart", async () => {
    const stub = await startStubLlmServer();
    const userDataPath = tempDirs.createSync("cocu-durable-");
    let daemon = await spawnDaemon({ userDataPath });
    try {
      const session = await startChatSession(daemon, stub);
      stub.plan = { kind: "hang" };
      await requestDaemon(
        "session.send",
        {
          sessionId: session.id,
          messageId: crypto.randomUUID(),
          content: "Summarize our plan",
        },
        daemon.options,
      );
      await stub.nextRequest();
      await daemon.stop();

      stub.plan = { kind: "stream", chunks: ["The", " plan"] };
      daemon = await spawnDaemon({ userDataPath });
      const state = await waitForAnswer(daemon, session.id);
      expect(responses(state.messages).at(-1)?.content).toBe("The plan");
      expect(state.messages.some((message) => message.role === "system")).toBe(
        false,
      );
    } finally {
      await daemon.stop();
      await stub.close();
    }
  });

  it("never resumes another session's conversation from a recreated durable store", async () => {
    const stub = await startStubLlmServer();
    const userDataPath = tempDirs.createSync("cocu-durable-");
    let daemon = await spawnDaemon({ userDataPath });
    try {
      const first = await startChatSession(daemon, stub);
      const second = await startChatSession(daemon, stub);
      const ask = (sessionId: string, content: string) =>
        requestDaemon(
          "session.send",
          { sessionId, messageId: crypto.randomUUID(), content },
          daemon.options,
        );
      stub.plan = { kind: "stream", chunks: ["First answer"] };
      await ask(first.id, "First secret");
      await waitForAnswer(daemon, first.id);
      stub.plan = { kind: "stream", chunks: ["Second answer"] };
      await ask(second.id, "Second secret");
      await waitForAnswer(daemon, second.id);
      await daemon.stop();
      dropDurableTables(userDataPath);

      daemon = await spawnDaemon({ userDataPath });
      stub.plan = { kind: "stream", chunks: ["Second again"] };
      await ask(second.id, "Second follow-up");
      await waitForResponses(daemon, second.id, 2);
      stub.plan = { kind: "stream", chunks: ["First again"] };
      await ask(first.id, "First follow-up");
      const state = await waitForResponses(daemon, first.id, 2);

      expect(
        responses(state.messages).map((message) => message.content),
      ).toEqual(["First answer", "First again"]);
      const sent = JSON.stringify(stub.requests.at(-1)?.body.messages);
      expect(sent).toContain("First follow-up");
      expect(sent).not.toContain("Second");
    } finally {
      await daemon.stop();
      await stub.close();
    }
  });
});

describe("durable work runs across daemon restarts", () => {
  it("finishes a work session's turn the daemon crashed in", async () => {
    const stub = await startStubLlmServer();
    const userDataPath = tempDirs.createSync("cocu-durable-");
    const rootPath = tempDirs.createSync("cocu-durable-work-");
    let daemon = await spawnDaemon({ userDataPath });
    try {
      const session = await startWorkSession(daemon, stub, rootPath, "main");
      stub.plan = { kind: "hang" };
      await requestDaemon(
        "session.send",
        {
          sessionId: session.id,
          messageId: crypto.randomUUID(),
          content: "Refactor the parser",
        },
        daemon.options,
      );
      await stub.nextRequest();
      await crash(daemon);

      stub.plan = { kind: "stream", chunks: ["Parser", " refactored"] };
      daemon = await spawnDaemon({ userDataPath });
      const state = await waitForAnswer(daemon, session.id);
      expect(responses(state.messages).at(-1)?.content).toBe(
        "Parser refactored",
      );
      expect(state.messages.some((message) => message.role === "system")).toBe(
        false,
      );
    } finally {
      await daemon.stop();
      await stub.close();
    }
  });

  it("leaves no turn of an interrupted script agent for the harness to resume", async () => {
    const stub = await startStubLlmServer();
    const userDataPath = tempDirs.createSync("cocu-durable-");
    const rootPath = tempDirs.createSync("cocu-durable-work-");
    let daemon = await spawnDaemon({ userDataPath });
    try {
      const requester = await startWorkSession(daemon, stub, rootPath, "main");
      const draft = await requestDaemon(
        "scriptRun.create",
        {
          requesterSessionId: requester.id,
          name: "restart",
          script: 'return await agent("Subagent task");',
        },
        daemon.options,
      );
      stub.plan = { kind: "hang" };
      await requestDaemon(
        "scriptRun.start",
        { runId: draft.id },
        daemon.options,
      );
      await stub.nextRequest();
      await crash(daemon);

      stub.plan = { kind: "stream", chunks: ["Task done"] };
      daemon = await spawnDaemon({ userDataPath });
      expect(await waitForScriptRun(daemon, draft.id)).toMatchObject({
        status: "completed",
      });
      await daemon.stop();
      const database = createCocurdexDatabase(getDatabasePath(userDataPath));
      try {
        useDurableStore(userDataPath, database.durableStore);
        expect(await listDurableInFlightInputs(userDataPath)).toEqual([]);
      } finally {
        await closeDurableHosts();
        database.close();
      }
    } finally {
      await daemon.stop();
      await stub.close();
    }
  });
});
