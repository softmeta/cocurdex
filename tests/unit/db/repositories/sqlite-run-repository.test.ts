import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "@cocurdex/db/internal/migrations";
import { createSqliteMessageRepository } from "@cocurdex/db/internal/repositories/sqlite-message-repository";
import { createSqliteRunRepository } from "@cocurdex/db/internal/repositories/sqlite-run-repository";
import { createSqliteToolCallRepository } from "@cocurdex/db/internal/repositories/sqlite-tool-call-repository";
import { describe, expect, it } from "vitest";

const now = "2026-10-11T00:00:00.000Z";

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  initializeDatabase(database);
  database.exec(`
    INSERT INTO workspaces (id, name, root_paths, created_at, updated_at, last_opened_at)
    VALUES ('w1', 'Repo', '["/repo"]', '${now}', '${now}', '${now}');
    INSERT INTO sessions (id, workspace_id, title, agent_type, status, write_mode, created_at, updated_at)
    VALUES
      ('s1', 'w1', 'Active', 'codex', 'running', 'read-only', '${now}', '${now}'),
      ('s2', 'w1', 'Legacy', 'codex', 'running', 'read-only', '${now}', '${now}'),
      ('s3', 'w1', 'Idle', 'codex', 'idle', 'read-only', '${now}', '${now}');
    INSERT INTO messages (id, session_id, role, content, attachments_json, created_at)
    VALUES
      ('m1', 's1', 'user', 'first', '[]', '${now}'),
      ('m2', 's1', 'user', 'second', '[]', '${now}');
  `);
  return database;
}

function startRun(id: string, triggerMessageId = "m1") {
  return {
    id,
    sessionId: "s1",
    triggerMessageId,
    status: "running" as const,
    startedAt: now,
  };
}

describe("createSqliteRunRepository", () => {
  it("allows only one running run per session", () => {
    const runs = createSqliteRunRepository(createDatabase());
    runs.insert(startRun("r1"));

    expect(() => runs.insert(startRun("r2", "m2"))).toThrow();
    expect(runs.getActiveBySessionId("s1")?.id).toBe("r1");
  });

  it("finishes a running run once and keeps the first terminal status", () => {
    const runs = createSqliteRunRepository(createDatabase());
    runs.insert(startRun("r1"));

    expect(runs.finish("r1", "failed", now, "boom")).toMatchObject({
      status: "failed",
      error: "boom",
      endedAt: now,
    });
    expect(runs.finish("r1", "completed", now)).toBeNull();
    expect(runs.getById("r1")?.status).toBe("failed");
    expect(runs.getActiveBySessionId("s1")).toBeNull();
    runs.insert(startRun("r2", "m2"));
    expect(runs.listActive().map((run) => run.id)).toEqual(["r2"]);
  });

  it("interrupts running runs and returns their sessions to idle after a restart", () => {
    const database = createDatabase();
    const runs = createSqliteRunRepository(database);
    runs.insert(startRun("r1"));

    const interrupted = runs.interruptRunning(now);

    expect(interrupted.runs.map((run) => run.status)).toEqual(["interrupted"]);
    expect(interrupted.sessionIds.sort()).toEqual(["s1", "s2"]);
    expect(
      database.prepare("SELECT id, status FROM sessions ORDER BY id").all(),
    ).toEqual([
      { id: "s1", status: "idle" },
      { id: "s2", status: "idle" },
      { id: "s3", status: "idle" },
    ]);
  });

  it("stamps messages and tool calls with the first run that wrote them", async () => {
    const database = createDatabase();
    const runs = createSqliteRunRepository(database);
    const messages = createSqliteMessageRepository(database);
    const toolCalls = createSqliteToolCallRepository(database);
    runs.insert(startRun("r1"));
    const reply = {
      id: "a1",
      sessionId: "s1",
      role: "assistant" as const,
      content: "hi",
      attachments: [],
      createdAt: now,
      runId: "r1",
    };
    await messages.append(reply);
    await messages.append({ ...reply, content: "hi again", runId: null });
    await toolCalls.upsert({
      id: "t1",
      sessionId: "s1",
      title: "Read",
      status: "pending",
      content: [],
      locations: [],
      startedAt: now,
      updatedAt: now,
      runId: "r1",
    });

    expect(await messages.getById("a1")).toMatchObject({
      content: "hi again",
      runId: "r1",
    });
    expect((await toolCalls.listBySessionId("s1"))[0]?.runId).toBe("r1");
  });
});
