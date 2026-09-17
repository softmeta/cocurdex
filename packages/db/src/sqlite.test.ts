import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { COCURDEX_APPLICATION_ID, CURRENT_SCHEMA_VERSION } from "./migrations";
import { createCocurdexDatabase } from "./sqlite";

function databasePath() {
  return path.join(
    mkdtempSync(path.join(tmpdir(), "cocurdex-db-")),
    "cocurdex.sqlite",
  );
}

function preMigrationSnapshots(target: string) {
  const directory = path.dirname(target);
  const prefix = `${path.basename(target)}.pre-migration-`;
  return readdirSync(directory)
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(directory, name))
    .sort();
}

describe("createCocurdexDatabase", () => {
  it("creates the marked version-one baseline in WAL mode", () => {
    const target = databasePath();
    const database = createCocurdexDatabase(target);
    database.close();

    const inspector = new DatabaseSync(target, { readOnly: true });
    const journalMode = inspector.prepare("PRAGMA journal_mode").get() as {
      journal_mode?: string;
    };
    const applicationId = inspector.prepare("PRAGMA application_id").get() as {
      application_id?: number;
    };
    const userVersion = inspector.prepare("PRAGMA user_version").get() as {
      user_version?: number;
    };
    inspector.close();

    expect(journalMode.journal_mode).toBe("wal");
    expect(applicationId.application_id).toBe(COCURDEX_APPLICATION_ID);
    expect(userVersion.user_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("recreates an obsolete pre-release database instead of migrating it", () => {
    const target = databasePath();
    const legacy = new DatabaseSync(target);
    legacy.exec(`
      CREATE TABLE legacy_notes (id TEXT PRIMARY KEY);
      PRAGMA user_version = 20;
    `);
    legacy.close();

    const database = createCocurdexDatabase(target);
    database.close();

    const inspector = new DatabaseSync(target, { readOnly: true });
    const legacyTable = inspector
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get("legacy_notes");
    const notesTable = inspector
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get("notes");
    inspector.close();

    expect(legacyTable).toBeUndefined();
    expect(notesTable).toEqual({ name: "notes" });
    expect(readdirSync(path.dirname(target))).toContainEqual(
      expect.stringMatching(/^cocurdex\.sqlite\.bak-/),
    );
  });

  it("keeps sessions and workspaces when the schema version advances", async () => {
    const target = databasePath();
    const database = createCocurdexDatabase(target);
    await database.workspaces.upsert({
      id: "workspace-1",
      name: "repo-a",
      rootPaths: ["/tmp/repo-a"],
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
      lastOpenedAt: "2026-06-25T00:00:00.000Z",
      sortOrder: 1000,
    });
    await database.sessions.upsert({
      id: "session-1",
      workspaceId: "workspace-1",
      title: "Survives an update",
      agentType: "codex",
      status: "idle",
      writeMode: "read-only",
      sessionModeId: "plan",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
      lastMessageAt: null,
      archivedAt: null,
      providerSnapshot: null,
    });
    database.close();

    const stale = new DatabaseSync(target);
    stale.exec("PRAGMA user_version = 5");
    stale.close();

    const reopened = createCocurdexDatabase(target);
    await expect(reopened.workspaces.list()).resolves.toMatchObject([
      { id: "workspace-1", rootPaths: ["/tmp/repo-a"] },
    ]);
    await expect(reopened.sessions.getById("session-1")).resolves.toMatchObject(
      { id: "session-1", sessionModeId: "plan" },
    );
    reopened.close();
  });

  it("keeps a snapshot of the database as it was before a migration", async () => {
    const target = databasePath();
    const database = createCocurdexDatabase(target);
    await database.workspaces.upsert({
      id: "workspace-1",
      name: "repo-a",
      rootPaths: ["/tmp/repo-a"],
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
      lastOpenedAt: "2026-06-25T00:00:00.000Z",
      sortOrder: 1000,
    });
    database.close();

    const stale = new DatabaseSync(target);
    stale.exec("PRAGMA user_version = 5");
    stale.close();

    createCocurdexDatabase(target).close();

    const snapshots = preMigrationSnapshots(target);
    expect(snapshots).toHaveLength(1);
    const snapshot = new DatabaseSync(snapshots[0], { readOnly: true });
    const version = snapshot.prepare("PRAGMA user_version").get() as
      | { user_version?: number }
      | undefined;
    const workspaces = snapshot
      .prepare("SELECT id, name, root_paths FROM workspaces")
      .all();
    snapshot.close();

    expect(version?.user_version).toBe(5);
    expect(workspaces).toEqual([
      { id: "workspace-1", name: "repo-a", root_paths: '["/tmp/repo-a"]' },
    ]);
  });

  it("keeps only the newest pre-migration snapshots", () => {
    const target = databasePath();
    for (let index = 0; index < 5; index++) {
      createCocurdexDatabase(target).close();
      const stale = new DatabaseSync(target);
      stale.exec("PRAGMA user_version = 5");
      stale.close();
    }
    createCocurdexDatabase(target).close();

    const snapshots = preMigrationSnapshots(target);
    expect(snapshots).toHaveLength(3);
    for (const snapshot of snapshots) {
      expect(existsSync(snapshot)).toBe(true);
    }
    expect(existsSync(target)).toBe(true);
  });

  it("rolls back every repository write when a transaction throws", async () => {
    const database = createCocurdexDatabase(databasePath());

    await database.workspaces.upsert({
      id: "workspace-1",
      name: "repo-a",
      rootPaths: ["/tmp/repo-a"],
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
      lastOpenedAt: "2026-06-25T00:00:00.000Z",
      sortOrder: 1000,
    });

    expect(() =>
      database.transaction(() => {
        void database.sessions.upsert({
          id: "session-1",
          workspaceId: "workspace-1",
          title: "Atomic writes",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          sessionModeId: null,
          createdAt: "2026-06-25T00:00:00.000Z",
          updatedAt: "2026-06-25T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        });
        throw new Error("boom");
      }),
    ).toThrow("boom");

    await expect(database.sessions.getById("session-1")).resolves.toBeNull();
    database.close();
  });
});
