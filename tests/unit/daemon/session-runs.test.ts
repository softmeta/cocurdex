import { createAgentRegistry } from "@cocurdex/agent-core";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type { MessageRecord } from "@cocurdex/shared";
import { sessionConfiguration } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();
const timestamp = "2026-10-11T00:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => tempDirs.cleanup());

async function createService(userDataPath?: string) {
  const root = userDataPath ?? (await tempDirs.create("cocurdex-runs-"));
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "test",
    userDataPath: root,
  });
  const pi = createAgentRegistry()
    .list()
    .find((agent) => agent.id === "pi");
  if (!pi) throw new Error("Pi descriptor not found");
  vi.spyOn(service, "listAgents").mockResolvedValue([
    { ...pi, availability: "available" },
  ]);
  if (!userDataPath) {
    await service.saveWorkspace({
      id: "workspace-1",
      name: "Runs",
      rootPaths: [root],
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      sortOrder: 1000,
    });
    await service.saveSessionConfiguration(
      sessionConfiguration({
        id: "session-1",
        workspaceId: "workspace-1",
        title: "Runs",
        agentType: "pi",
        status: "idle",
        writeMode: "read-only",
        sessionModeId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessageAt: null,
      }),
    );
  }
  return { service, root };
}

function reply(content: string): MessageRecord {
  return {
    id: crypto.randomUUID(),
    sessionId: "session-1",
    role: "assistant",
    content,
    attachments: [],
    createdAt: new Date().toISOString(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function send(service: CocurdexDaemonService, messageId: string) {
  return service.sendSessionMessage({
    sessionId: "session-1",
    messageId,
    content: "Do the work",
  });
}

describe("session runs", () => {
  it("records a run from the trigger message to completion and stamps its output", async () => {
    const { service } = await createService();
    const turn = deferred<MessageRecord>();
    vi.spyOn(service.runtime, "sendSessionMessage").mockReturnValue(
      turn.promise,
    );
    try {
      const userMessage = await send(service, "m1");
      const run = service.runs.activeRuns()[0];
      expect(run).toMatchObject({
        sessionId: "session-1",
        triggerMessageId: "m1",
        status: "running",
      });
      expect(userMessage.runId).toBe(run?.id);
      expect((await service.bootstrap()).activeRuns).toEqual([run]);

      const answer = reply("Done");
      service.runtime.emitAgentEvent({
        type: "message.completed",
        sessionId: "session-1",
        message: answer,
      });
      turn.resolve(answer);
      const outcome = await service.waitForSessionTurn("session-1");

      expect(outcome).toEqual({ status: "completed", message: answer });
      await service.runtime.flushEvents();
      expect(await service.state.getMessageById(answer.id)).toMatchObject({
        runId: run?.id,
      });
      expect(service.state.getActiveRun("session-1")).toBeNull();
      expect((await service.getSession("session-1"))?.status).toBe("idle");
    } finally {
      turn.resolve(reply("cleanup"));
      await service.shutdown();
    }
  });

  it("treats a retried send with the same message ID as the original", async () => {
    const { service } = await createService();
    const turn = deferred<MessageRecord>();
    const dispatch = vi
      .spyOn(service.runtime, "sendSessionMessage")
      .mockReturnValue(turn.promise);
    try {
      const first = await send(service, "m1");
      const retried = await send(service, "m1");

      expect(retried.id).toBe(first.id);
      expect(retried.runId).toBe(first.runId);
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce(), {
        timeout: 5_000,
      });
      expect(service.runs.activeRuns()).toHaveLength(1);
    } finally {
      turn.resolve(reply("cleanup"));
      await service.shutdown();
    }
  });

  it("cancels the run when the user stops it", async () => {
    const { service } = await createService();
    const turn = deferred<MessageRecord>();
    vi.spyOn(service.runtime, "sendSessionMessage").mockReturnValue(
      turn.promise,
    );
    vi.spyOn(service.runtime, "cancelSessionTurn").mockImplementation(
      async () => {
        turn.resolve(reply("partial"));
        return true;
      },
    );
    try {
      const userMessage = await send(service, "m1");
      await service.stopSession("session-1");

      expect(service.runs.hasActiveRun("session-1")).toBe(false);
      const runs = (await service.state.getDatabase()).runs;
      expect(runs.getById(userMessage.runId ?? "")).toMatchObject({
        status: "cancelled",
      });
      await service.runtime.flushEvents();
      expect((await service.getSession("session-1"))?.status).toBe("idle");
    } finally {
      await service.shutdown();
    }
  });

  it("fails the run and the session when the provider rejects", async () => {
    const { service } = await createService();
    vi.spyOn(service.runtime, "sendSessionMessage").mockRejectedValue(
      new Error("provider exploded"),
    );
    try {
      const userMessage = await send(service, "m1");

      await vi.waitFor(
        () => expect(service.runs.hasActiveRun("session-1")).toBe(false),
        { timeout: 5_000 },
      );
      await service.runtime.flushEvents();
      const runs = (await service.state.getDatabase()).runs;
      expect(runs.getById(userMessage.runId ?? "")).toMatchObject({
        status: "failed",
        error: "provider exploded",
      });
      expect((await service.getSession("session-1"))?.status).toBe("error");
    } finally {
      await service.shutdown();
    }
  });

  it("marks runs left running by a crashed daemon as interrupted on startup", async () => {
    const { service, root } = await createService();
    const userMessage = {
      id: "m1",
      sessionId: "session-1",
      role: "user" as const,
      content: "Do the work",
      attachments: [],
      createdAt: timestamp,
    };
    await service.state.saveUserMessage(userMessage);
    await service.state.startRun({
      id: "run-1",
      sessionId: "session-1",
      triggerMessageId: "m1",
      status: "running",
      startedAt: timestamp,
    });
    const database = await service.state.getDatabase();
    await database.sessions.updateStatus("session-1", "running");
    await service.shutdown();

    const restarted = (await createService(root)).service;
    try {
      await restarted.state.waitForStartupRecovery();
      const runs = (await restarted.state.getDatabase()).runs;
      expect(runs.getById("run-1")).toMatchObject({ status: "interrupted" });
      expect((await restarted.getSession("session-1"))?.status).toBe("idle");
      expect((await restarted.bootstrap()).activeRuns).toEqual([]);
      const messages =
        await restarted.state.listMessagesBySessionId("session-1");
      expect(messages.at(-1)).toMatchObject({
        role: "system",
        content: expect.stringContaining("Send a message to continue"),
      });
    } finally {
      await restarted.shutdown();
    }
  });
});
