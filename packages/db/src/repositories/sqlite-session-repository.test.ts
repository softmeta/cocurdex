import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSchemaSql } from "../schema";
import { createSqliteSessionRepository } from "./sqlite-session-repository";
import { createSqliteWorkspaceRepository } from "./sqlite-workspace-repository";

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(createSchemaSql());
  return database;
}

const now = "2026-08-27T00:00:00.000Z";

describe("createSqliteSessionRepository", () => {
  it("round-trips the session permission mode across restart-style reads", async () => {
    const database = createDatabase();
    const workspaces = createSqliteWorkspaceRepository(database);
    const sessions = createSqliteSessionRepository(database);

    await workspaces.upsert({
      id: "workspace-1",
      name: "repo",
      rootPath: "/tmp/repo",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sortOrder: 1000,
    });
    await sessions.upsert({
      id: "session-1",
      workspaceId: "workspace-1",
      title: "Claude Agent",
      agentType: "claude-agent",
      status: "idle",
      writeMode: "native-write",
      collaborationMode: "default",
      permissionMode: "claude-auto",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      archivedAt: null,
      providerSnapshot: {
        providerId: "claude-agent",
        providerName: "Claude Agent",
        modelId: "opus",
        modelName: "Opus 5",
        api: "anthropic-messages",
        baseUrl: "",
        headersJson: null,
      },
    });

    expect(await sessions.getById("session-1")).toMatchObject({
      permissionMode: "claude-auto",
    });
  });

  it("lists child sessions with their parent", async () => {
    const database = createDatabase();
    const workspaces = createSqliteWorkspaceRepository(database);
    const sessions = createSqliteSessionRepository(database);

    await workspaces.upsert({
      id: "workspace-1",
      name: "repo",
      rootPath: "/tmp/repo",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sortOrder: 1000,
    });
    await sessions.upsert({
      id: "parent",
      workspaceId: "workspace-1",
      title: "Parent",
      agentType: "grok-build",
      status: "idle",
      writeMode: "native-write",
      collaborationMode: "default",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
      archivedAt: null,
    });
    await sessions.upsert({
      id: "child",
      workspaceId: "workspace-1",
      title: "Standards review",
      agentType: "grok-build",
      sessionKind: "subagent",
      parentSessionId: "parent",
      status: "running",
      writeMode: "native-write",
      collaborationMode: "default",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      archivedAt: null,
    });

    const listed = await sessions.list();
    expect(listed.map((session) => session.id).sort()).toEqual([
      "child",
      "parent",
    ]);
    expect(listed.find((session) => session.id === "child")).toMatchObject({
      parentSessionId: "parent",
      sessionKind: "subagent",
    });
  });

  it("archives a parent and its descendant sessions together", async () => {
    const database = createDatabase();
    const workspaces = createSqliteWorkspaceRepository(database);
    const sessions = createSqliteSessionRepository(database);

    await workspaces.upsert({
      id: "workspace-1",
      name: "repo",
      rootPath: "/tmp/repo",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sortOrder: 1000,
    });
    await sessions.upsert({
      id: "parent",
      workspaceId: "workspace-1",
      title: "Parent",
      agentType: "grok-build",
      status: "idle",
      writeMode: "native-write",
      collaborationMode: "default",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
      archivedAt: null,
    });
    await sessions.upsert({
      id: "child",
      workspaceId: "workspace-1",
      title: "Child",
      agentType: "grok-build",
      sessionKind: "subagent",
      parentSessionId: "parent",
      status: "idle",
      writeMode: "native-write",
      collaborationMode: "default",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      archivedAt: null,
    });

    await sessions.archive("parent", "2026-08-31T12:00:00.000Z");

    expect(await sessions.list()).toEqual([]);
    expect(await sessions.getById("parent")).toMatchObject({
      archivedAt: "2026-08-31T12:00:00.000Z",
    });
    expect(await sessions.getById("child")).toMatchObject({
      archivedAt: "2026-08-31T12:00:00.000Z",
    });
  });
});
