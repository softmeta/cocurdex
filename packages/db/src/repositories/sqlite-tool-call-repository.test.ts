import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentToolCallRecord } from "@cocurdex/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createCocurdexDatabase } from "../sqlite";

type Database = ReturnType<typeof createCocurdexDatabase>;

function createDatabase() {
  return createCocurdexDatabase(
    path.join(
      mkdtempSync(path.join(tmpdir(), "cocurdex-db-")),
      "cocurdex.sqlite",
    ),
  );
}

async function seedSession(database: Database, sessionId: string) {
  const workspaceId = `${sessionId}-workspace`;
  const now = new Date().toISOString();
  await database.workspaces.upsert({
    id: workspaceId,
    name: "workspace",
    rootPath: `/tmp/${workspaceId}`,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  });
  await database.sessions.upsert({
    id: sessionId,
    workspaceId,
    title: "session",
    agentType: "grok-build",
    status: "idle",
    writeMode: "read-only",
    collaborationMode: "default",
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    archivedAt: null,
    providerSnapshot: null,
  });
}

function toolCall(
  id: string,
  sessionId: string,
  status: AgentToolCallRecord["status"],
): AgentToolCallRecord {
  const now = new Date().toISOString();
  return {
    id,
    sessionId,
    title: `tool ${id}`,
    status,
    content: [],
    locations: [],
    startedAt: now,
    updatedAt: now,
  };
}

describe("failNonTerminal", () => {
  let database: Database;

  beforeEach(async () => {
    database = createDatabase();
    await seedSession(database, "session-1");
  });

  it("fails tool calls left mid-flight and leaves terminal ones untouched", async () => {
    await database.toolCalls.upsert(toolCall("a", "session-1", "pending"));
    await database.toolCalls.upsert(toolCall("b", "session-1", "in_progress"));
    await database.toolCalls.upsert(toolCall("c", "session-1", "completed"));
    await database.toolCalls.upsert(toolCall("d", "session-1", "failed"));
    const before = await database.toolCalls.list();

    await database.toolCalls.failNonTerminal();

    const byId = new Map(
      (await database.toolCalls.list()).map((record) => [record.id, record]),
    );
    expect(byId.get("a")?.status).toBe("failed");
    expect(byId.get("b")?.status).toBe("failed");
    expect(byId.get("c")).toEqual(before.find((record) => record.id === "c"));
    expect(byId.get("d")).toEqual(before.find((record) => record.id === "d"));
  });
});

describe("subagent reference", () => {
  it("persists the provider-neutral child session relationship", async () => {
    const database = createDatabase();
    await seedSession(database, "session-1");
    const record = toolCall("task-1", "session-1", "in_progress");
    record.subagent = {
      sessionId: "child-session-1",
      type: "reviewer",
      description: "Review the current diff",
    };

    await database.toolCalls.upsert(record);

    expect(
      (await database.toolCalls.listBySessionId("session-1"))[0]?.subagent,
    ).toEqual(record.subagent);
    expect(
      (await database.toolCalls.listSummariesBySessionId("session-1"))[0]
        ?.subagent,
    ).toEqual(record.subagent);
  });
});
