import { DatabaseSync } from "node:sqlite";
import type { SessionRecord } from "@cocurdex/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createSchemaSql } from "../schema";
import { createSqliteSessionRepository } from "./sqlite-session-repository";
import { createSqliteWorkspaceRepository } from "./sqlite-workspace-repository";

const databases: DatabaseSync[] = [];
const now = "2026-09-05T00:00:00.000Z";
const earlier = "2026-09-04T00:00:00.000Z";

async function setup() {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(createSchemaSql());
  await createSqliteWorkspaceRepository(database).upsert({
    id: "workspace",
    name: "Archive test",
    rootPath: "/tmp/archive-test",
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1,
  });
  const sessions = createSqliteSessionRepository(database);
  const base: SessionRecord = {
    id: "parent",
    workspaceId: "workspace",
    title: "Parent session",
    agentType: "grok-build",
    status: "idle",
    writeMode: "native-write",
    collaborationMode: "default",
    createdAt: earlier,
    updatedAt: earlier,
    lastMessageAt: earlier,
    archivedAt: null,
  };
  await sessions.upsert(base);
  await sessions.upsert({
    ...base,
    id: "child",
    parentSessionId: "parent",
    sessionKind: "subagent",
  });
  await sessions.upsert({
    ...base,
    id: "grandchild",
    parentSessionId: "child",
    sessionKind: "subagent",
  });
  await sessions.upsert({ ...base, id: "independent" });
  return { database, sessions };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe("session archive lifecycle", () => {
  it("lists persisted archives and restores the entire archived subtree", async () => {
    const { database, sessions } = await setup();
    await sessions.archive("parent", now);
    const reopened = createSqliteSessionRepository(database);
    expect((await reopened.listArchived()).map((s) => s.id).sort()).toEqual([
      "child",
      "grandchild",
      "parent",
    ]);
    expect(
      (await reopened.listByWorkspaceId("workspace")).map((s) => s.id),
    ).toEqual(["independent"]);
    const restored = await reopened.restore("parent");
    expect(restored.map((s) => s.id).sort()).toEqual([
      "child",
      "grandchild",
      "parent",
    ]);
    expect(
      restored.every(
        (s) => s.archivedAt === null && s.lastMessageAt === earlier,
      ),
    ).toBe(true);
    expect(await reopened.listArchived()).toEqual([]);
    expect(await reopened.list()).toHaveLength(4);
    expect(await reopened.restore("parent")).toEqual([]);
    expect(await reopened.restore("missing")).toEqual([]);
  });

  it("keeps separately archived children archived when their parent is restored", async () => {
    const { sessions } = await setup();
    await sessions.archive("child", earlier);
    await sessions.archive("parent", now);
    expect(await sessions.getById("child")).toMatchObject({
      archivedAt: earlier,
    });
    expect((await sessions.restore("parent")).map((s) => s.id)).toEqual([
      "parent",
    ]);
    expect((await sessions.listArchived()).map((s) => s.id).sort()).toEqual([
      "child",
      "grandchild",
    ]);
    expect((await sessions.restore("child")).map((s) => s.id).sort()).toEqual([
      "child",
      "grandchild",
    ]);
  });

  it("rejects restoring a child beneath an archived parent without changing data", async () => {
    const { sessions } = await setup();
    await sessions.archive("parent", now);
    await expect(sessions.restore("child")).rejects.toThrow(
      "Restore the parent session first",
    );
    expect(await sessions.listArchived()).toHaveLength(3);
    expect((await sessions.list()).map((s) => s.id)).toEqual(["independent"]);
  });
});
