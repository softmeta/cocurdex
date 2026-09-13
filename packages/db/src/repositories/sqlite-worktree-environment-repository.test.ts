import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSchemaSql } from "../schema";
import { createSqliteWorkspaceRepository } from "./sqlite-workspace-repository";
import { createSqliteWorktreeEnvironmentRepository } from "./sqlite-worktree-environment-repository";

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(createSchemaSql());
  return database;
}

const now = "2026-09-07T00:00:00.000Z";

describe("createSqliteWorktreeEnvironmentRepository", () => {
  it("round-trips setup and cleanup scripts for a workspace", async () => {
    const database = createDatabase();
    const workspaces = createSqliteWorkspaceRepository(database);
    const environments = createSqliteWorktreeEnvironmentRepository(database);

    await workspaces.upsert({
      id: "workspace-1",
      name: "repo",
      rootPaths: ["/tmp/repo"],
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sortOrder: 1000,
    });
    await environments.upsert({
      workspaceId: "workspace-1",
      setupScript: "pnpm install",
      cleanupScript: "rm -rf node_modules",
      updatedAt: now,
    });

    expect(await environments.getByWorkspaceId("workspace-1")).toEqual({
      workspaceId: "workspace-1",
      setupScript: "pnpm install",
      cleanupScript: "rm -rf node_modules",
      updatedAt: now,
    });
  });

  it("returns null when the workspace has no environment row", async () => {
    const database = createDatabase();
    const environments = createSqliteWorktreeEnvironmentRepository(database);
    expect(await environments.getByWorkspaceId("missing")).toBeNull();
  });
});
