import type { DatabaseSync } from "node:sqlite";
import type { WorkspaceWorktreeEnvironment } from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import { toNullableString } from "../sqlite-types";
import type { WorktreeEnvironmentRepository } from "./worktree-environment-repository";

function mapWorktreeEnvironment(row: SqliteRow): WorkspaceWorktreeEnvironment {
  return {
    workspaceId: String(row.workspace_id),
    setupScript: String(row.setup_script ?? ""),
    cleanupScript: String(row.cleanup_script ?? ""),
    updatedAt: toNullableString(row.updated_at),
  };
}

export function createSqliteWorktreeEnvironmentRepository(
  database: DatabaseSync,
): WorktreeEnvironmentRepository {
  return {
    async getByWorkspaceId(workspaceId) {
      const row = database
        .prepare(
          `SELECT * FROM workspace_worktree_environments WHERE workspace_id = ?`,
        )
        .get(workspaceId) as SqliteRow | undefined;
      return row ? mapWorktreeEnvironment(row) : null;
    },
    async upsert(environment) {
      database
        .prepare(
          `INSERT INTO workspace_worktree_environments (
             workspace_id, setup_script, cleanup_script, updated_at
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(workspace_id) DO UPDATE SET
             setup_script = excluded.setup_script,
             cleanup_script = excluded.cleanup_script,
             updated_at = excluded.updated_at`,
        )
        .run(
          environment.workspaceId,
          environment.setupScript,
          environment.cleanupScript,
          environment.updatedAt ?? new Date().toISOString(),
        );
    },
  };
}
