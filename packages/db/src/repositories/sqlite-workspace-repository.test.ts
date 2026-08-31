import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSchemaSql } from "../schema";
import { createSqliteWorkspaceRepository } from "./sqlite-workspace-repository";

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(createSchemaSql());
  return database;
}

const now = new Date().toISOString();

describe("createSqliteWorkspaceRepository", () => {
  it("lists workspaces by sort_order ascending", async () => {
    const database = createDatabase();
    const repository = createSqliteWorkspaceRepository(database);

    await repository.upsert({
      id: "newer-created",
      name: "newer",
      rootPath: "/tmp/newer",
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-20T12:00:00.000Z",
      lastOpenedAt: "2026-04-20T12:00:00.000Z",
      sortOrder: 1000,
    });
    await repository.upsert({
      id: "older-created",
      name: "older",
      rootPath: "/tmp/older",
      createdAt: "2026-04-20T09:00:00.000Z",
      updatedAt: "2026-04-20T13:00:00.000Z",
      lastOpenedAt: "2026-04-20T13:00:00.000Z",
      sortOrder: 2000,
    });

    const listed = await repository.list();
    expect(listed.map((workspace) => workspace.id)).toEqual([
      "newer-created",
      "older-created",
    ]);
  });

  it("deletes a workspace that still has workflow runs", async () => {
    const database = createDatabase();
    const repository = createSqliteWorkspaceRepository(database);
    await repository.upsert({
      id: "workspace-1",
      name: "workspace",
      rootPath: "/tmp/workspace-1",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sortOrder: 1000,
    });
    database
      .prepare(
        `INSERT INTO workflow_runs (
           id, workspace_id, workspace_root_path, root_prompt,
           definition_id, definition_version, frozen_definition_json,
           frozen_bindings_json, status, revision, transition_counts_json,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "run-1",
        "workspace-1",
        "/tmp/workspace-1",
        "prompt",
        "definition-1",
        1,
        "{}",
        "{}",
        "running",
        1,
        "{}",
        now,
        now,
      );

    await repository.delete("workspace-1");

    expect(await repository.list()).toEqual([]);
  });
});
