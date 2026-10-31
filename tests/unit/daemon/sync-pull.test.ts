import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type {
  MessageRecord,
  SessionRecord,
  SyncPullResult,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

const now = "2026-10-14T00:00:00.000Z";

function session(id: string): SessionRecord {
  return {
    id,
    workspaceId: "workspace-1",
    title: id,
    agentType: "pi",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  };
}

function message(
  id: string,
  sessionId: string,
  content: string,
): MessageRecord {
  return {
    id,
    sessionId,
    role: "assistant",
    content,
    attachments: [],
    createdAt: now,
  };
}

async function createService(userDataPath = tempDirs.createSync("sync-pull-")) {
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "sync-pull-test",
    userDataPath,
  });
  return { service, userDataPath };
}

async function seed(service: CocurdexDaemonService) {
  await service.saveWorkspace({
    id: "workspace-1",
    name: "acme-shop",
    rootPaths: ["/acme-shop"],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  });
  for (const id of ["session-1", "session-2"]) {
    await service.state.saveSession(session(id));
  }
  const database = await service.state.getDatabase();
  await database.messages.append(message("m1", "session-1", "hello"));
  await database.messages.append(message("m2", "session-1", "queued"));
  await database.messages.append(message("m3", "session-2", "other"));
  return database;
}

function transcriptOf(result: SyncPullResult, sessionId: string) {
  return result.transcripts[sessionId];
}

describe("sync.pull", () => {
  it("returns everything without a cursor and only changes with one", async () => {
    const { service } = await createService();
    const database = await seed(service);
    const sessionIds = ["session-1", "session-2"];

    const full = await service.pullSync({ sessionIds });
    expect(full.mode).toBe("full");
    expect(transcriptOf(full, "session-1")?.messages.map((m) => m.id)).toEqual([
      "m1",
      "m2",
    ]);

    await database.messages.append(message("m1", "session-1", "hello again"));
    await database.messages.delete("m2");
    await database.sessions.delete("session-2");

    const delta = await service.pullSync({
      sessionIds,
      hydratedSessionIds: sessionIds,
      cursor: full.cursor,
    });
    expect(delta.mode).toBe("delta");
    expect(delta.removedSessionIds).toEqual(["session-2"]);
    expect(transcriptOf(delta, "session-2")).toBe(null);
    expect(transcriptOf(delta, "session-1")).toMatchObject({
      complete: false,
      messages: [{ id: "m1", content: "hello again" }],
      deletedMessageIds: ["m2"],
      toolCalls: [],
      turnChangeSets: null,
    });

    const idle = await service.pullSync({
      sessionIds,
      hydratedSessionIds: sessionIds,
      cursor: delta.cursor,
    });
    expect(idle.sessions).toEqual([]);
    expect(transcriptOf(idle, "session-1")).toMatchObject({
      messages: [],
      deletedMessageIds: [],
    });
    await service.shutdown();
  });

  it("continues incrementally after a daemon restart", async () => {
    const { service, userDataPath } = await createService();
    await seed(service);
    const before = await service.pullSync({ sessionIds: ["session-1"] });
    await service.shutdown();

    const { service: restarted } = await createService(userDataPath);
    const database = await restarted.state.getDatabase();
    await database.messages.append(message("m4", "session-1", "after restart"));

    const after = await restarted.pullSync({
      sessionIds: ["session-1"],
      hydratedSessionIds: ["session-1"],
      cursor: before.cursor,
    });
    expect(after.mode).toBe("delta");
    expect(transcriptOf(after, "session-1")?.messages.map((m) => m.id)).toEqual(
      ["m4"],
    );
    await restarted.shutdown();
  });

  it("falls back to a full pull for a cursor it cannot serve", async () => {
    const { service } = await createService();
    await seed(service);
    const other = await createService();
    const foreign = await other.service.pullSync({ sessionIds: [] });
    await other.service.shutdown();

    for (const cursor of [foreign.cursor, "v1.garbage", "v1.0.99999999"]) {
      const result = await service.pullSync({
        sessionIds: ["session-1"],
        cursor,
      });
      expect(result.mode).toBe("full");
    }
    await service.shutdown();
  });

  it("returns the full change set map when a turn change set changes", async () => {
    const { service } = await createService();
    const database = await seed(service);
    const start = await service.pullSync({ sessionIds: ["session-1"] });
    await database.turnChangeSets.upsert({
      id: "change-1",
      sessionId: "session-1",
      messageId: "m1",
      userMessageId: "u1",
      source: "git-checkpoint",
      coverage: "workspace",
      status: "ready",
      files: [{ path: "src/cart.ts", operation: "modify", reviewKind: "text" }],
      createdAt: now,
      updatedAt: now,
    });

    const delta = await service.pullSync({
      sessionIds: ["session-1"],
      hydratedSessionIds: ["session-1"],
      cursor: start.cursor,
    });
    expect(
      Object.keys(transcriptOf(delta, "session-1")?.turnChangeSets ?? {}),
    ).toEqual(["m1"]);
    await service.shutdown();
  });

  it("sends a complete transcript for a session the client has not loaded", async () => {
    const { service } = await createService();
    await seed(service);
    const start = await service.pullSync({ sessionIds: [] });

    const result = await service.pullSync({
      sessionIds: ["session-1"],
      hydratedSessionIds: [],
      cursor: start.cursor,
    });
    expect(result.mode).toBe("delta");
    expect(transcriptOf(result, "session-1")).toMatchObject({
      complete: true,
      messages: [{ id: "m1" }, { id: "m2" }],
    });
    await service.shutdown();
  });
});
