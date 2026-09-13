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
           ORDER BY sort_order ASC, created_at ASC, id ASC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapWorkspace);
    },
    async upsert(workspace) {
      database
        .prepare(
          `INSERT INTO workspaces (
             id, name, root_paths, created_at, updated_at, last_opened_at,
             sort_order
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             root_paths = excluded.root_paths,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             last_opened_at = excluded.last_opened_at,
             sort_order = excluded.sort_order`,
        )
        .run(
          workspace.id,
          workspace.name,
          JSON.stringify(workspace.rootPaths),
          workspace.createdAt,
          workspace.updatedAt,
          workspace.lastOpenedAt,
          workspace.sortOrder,
        );
    },
    async delete(workspaceId) {
      // Sessions, their child rows and workflow runs are removed by the
      // ON DELETE CASCADE chain declared in the schema.
      database.prepare("DELETE FROM workspaces WHERE id = ?").run(workspaceId);
    },
  };
}
