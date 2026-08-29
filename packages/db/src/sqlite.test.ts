import { mkdtempSync } from "node:fs";
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
  });

  it("rolls back every repository write when a transaction throws", async () => {
    const database = createCocurdexDatabase(databasePath());

    await database.workspaces.upsert({
      id: "workspace-1",
      name: "repo-a",
      rootPath: "/tmp/repo-a",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
      lastOpenedAt: "2026-06-25T00:00:00.000Z",
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
          collaborationMode: "default",
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
