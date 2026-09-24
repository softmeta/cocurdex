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
      proposal: null,
    });
  });

  it("round-trips a pending proposal without touching saved scripts", async () => {
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
      setupScript: "npm install",
      cleanupScript: "",
      updatedAt: now,
      proposal: null,
    });

    await environments.saveProposal("workspace-1", {
      setupScript: "pnpm install",
      cleanupScript: "rm -rf .turbo",
      rationale: "pnpm lockfile detected",
      proposedAt: "2026-09-23T00:00:00.000Z",
    });

    expect(await environments.getByWorkspaceId("workspace-1")).toEqual({
      workspaceId: "workspace-1",
      setupScript: "npm install",
      cleanupScript: "",
      updatedAt: now,
      proposal: {
        setupScript: "pnpm install",
        cleanupScript: "rm -rf .turbo",
        rationale: "pnpm lockfile detected",
        proposedAt: "2026-09-23T00:00:00.000Z",
      },
    });

    await environments.upsert({
      workspaceId: "workspace-1",
      setupScript: "npm install",
      cleanupScript: "",
      updatedAt: now,
      proposal: null,
    });
    expect(
      (await environments.getByWorkspaceId("workspace-1"))?.proposal,
    ).toBeNull();
  });

  it("creates a proposal row for a workspace with no saved environment", async () => {
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
    await environments.saveProposal("workspace-1", {
      setupScript: "pnpm install",
      cleanupScript: "",
      rationale: null,
      proposedAt: now,
    });

    const stored = await environments.getByWorkspaceId("workspace-1");
    expect(stored?.setupScript).toBe("");
    expect(stored?.proposal?.setupScript).toBe("pnpm install");
  });

  it("returns null when the workspace has no environment row", async () => {
    const database = createDatabase();
    const environments = createSqliteWorktreeEnvironmentRepository(database);
    expect(await environments.getByWorkspaceId("missing")).toBeNull();
  });
});
