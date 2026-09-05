import type { DatabaseSync } from "node:sqlite";
import { mapSession } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { SessionRepository } from "./session-repository";

export function createSqliteSessionRepository(
  database: DatabaseSync,
): SessionRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT * FROM sessions
           WHERE archived_at IS NULL
           ORDER BY COALESCE(last_message_at, updated_at) DESC, created_at DESC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapSession);
    },
    async listArchived() {
      const rows = database
        .prepare(
          `SELECT * FROM sessions
           WHERE archived_at IS NOT NULL
           ORDER BY archived_at DESC, id`,
        )
        .all() as SqliteRow[];
      return rows.map(mapSession);
    },
    async restore(sessionId) {
      const session = await this.getById(sessionId);
      if (!session?.archivedAt) {
        return [];
      }
      if (session.parentSessionId) {
        const parent = await this.getById(session.parentSessionId);
        if (parent?.archivedAt) {
          throw new Error("Restore the parent session first");
        }
      }
      const rows = database
        .prepare(
          `WITH RECURSIVE tree(id) AS (
             SELECT id FROM sessions WHERE id = ?
             UNION
             SELECT sessions.id FROM sessions
             JOIN tree ON sessions.parent_session_id = tree.id
             WHERE sessions.archived_at = ?
           )
           UPDATE sessions SET archived_at = NULL
           WHERE id IN (SELECT id FROM tree)
           RETURNING *`,
        )
        .all(sessionId, session.archivedAt) as SqliteRow[];
      return rows.map(mapSession);
    },
    async listByWorkspaceId(workspaceId) {
      const rows = database
        .prepare(
          `SELECT * FROM sessions
           WHERE workspace_id = ? AND archived_at IS NULL
           ORDER BY COALESCE(last_message_at, updated_at) DESC, created_at DESC`,
        )
        .all(workspaceId) as SqliteRow[];
      return rows.map(mapSession);
    },
    async getById(sessionId) {
      const row = database
        .prepare("SELECT * FROM sessions WHERE id = ?")
        .get(sessionId) as SqliteRow | undefined;
      return row ? mapSession(row) : null;
    },
    async upsert(session) {
      database
        .prepare(
          `INSERT INTO sessions (
             id, workspace_id, title, agent_type, session_kind,
             parent_session_id, parent_tool_call_id, status, write_mode,
             collaboration_mode, permission_mode, provider_snapshot_json,
             created_at, updated_at, last_message_at, archived_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             workspace_id = excluded.workspace_id,
             title = excluded.title,
             agent_type = excluded.agent_type,
             session_kind = excluded.session_kind,
             parent_session_id = excluded.parent_session_id,
             parent_tool_call_id = excluded.parent_tool_call_id,
             status = excluded.status,
             write_mode = excluded.write_mode,
             collaboration_mode = excluded.collaboration_mode,
             permission_mode = excluded.permission_mode,
             provider_snapshot_json = excluded.provider_snapshot_json,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             last_message_at = excluded.last_message_at,
             archived_at = excluded.archived_at`,
        )
        .run(
          session.id,
          session.workspaceId,
          session.title,
          session.agentType,
          session.sessionKind ?? "main",
          session.parentSessionId ?? null,
          session.parentToolCallId ?? null,
          session.status,
          session.writeMode,
          session.collaborationMode,
          session.permissionMode ?? null,
          session.providerSnapshot
            ? JSON.stringify(session.providerSnapshot)
            : null,
          session.createdAt,
          session.updatedAt,
          session.lastMessageAt,
          session.archivedAt ?? null,
        );
    },
    async updateTitle(sessionId, title, updatedAt, expectedTitle) {
      const nextUpdatedAt = updatedAt ?? new Date().toISOString();
      if (expectedTitle === undefined) {
        database
          .prepare(
            `UPDATE sessions
             SET title = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(title, nextUpdatedAt, sessionId);
      } else {
        database
          .prepare(
            `UPDATE sessions
             SET title = ?, updated_at = ?
             WHERE id = ? AND title = ?`,
          )
          .run(title, nextUpdatedAt, sessionId, expectedTitle);
      }

      return this.getById(sessionId);
    },
    async updateStatus(sessionId, status) {
      const now = new Date().toISOString();
      database
        .prepare(
          `UPDATE sessions
           SET status = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(status, now, sessionId);
    },
    async archive(sessionId, archivedAt) {
      const nextArchivedAt = archivedAt ?? new Date().toISOString();
      database
        .prepare(
          `WITH RECURSIVE tree(id) AS (
             SELECT id FROM sessions WHERE id = ?
             UNION ALL
             SELECT sessions.id
             FROM sessions
             JOIN tree ON sessions.parent_session_id = tree.id
           )
           UPDATE sessions
           SET archived_at = ?, updated_at = ?
           WHERE id IN (SELECT id FROM tree) AND archived_at IS NULL`,
        )
        .run(sessionId, nextArchivedAt, nextArchivedAt);

      return this.getById(sessionId);
    },
    async delete(sessionId) {
      // Child sessions, messages, tool calls and the rest of the session-owned
      // rows are removed by the ON DELETE CASCADE chain declared in the schema.
      database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    },
    async normalizeRunningToIdle() {
      const now = new Date().toISOString();
      database
        .prepare(
          `UPDATE sessions
           SET status = 'idle', updated_at = ?
           WHERE status = 'running'`,
        )
        .run(now);
    },
  };
}
