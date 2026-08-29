import type { DatabaseSync } from "node:sqlite";
import { mapWorkspace } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { WorkspaceRepository } from "./workspace-repository";

export function createSqliteWorkspaceRepository(
  database: DatabaseSync,
): WorkspaceRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT * FROM workspaces
           ORDER BY last_opened_at DESC, updated_at DESC, created_at DESC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapWorkspace);
    },
    async upsert(workspace) {
      database
        .prepare(
          `INSERT INTO workspaces (
             id, name, root_path, created_at, updated_at, last_opened_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             root_path = excluded.root_path,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             last_opened_at = excluded.last_opened_at`,
        )
        .run(
          workspace.id,
          workspace.name,
          workspace.rootPath,
          workspace.createdAt,
          workspace.updatedAt,
          workspace.lastOpenedAt,
        );
    },
    async delete(workspaceId) {
      // Sessions, their child rows and workflow runs are removed by the
      // ON DELETE CASCADE chain declared in the schema.
      database.prepare("DELETE FROM workspaces WHERE id = ?").run(workspaceId);
    },
  };
}
