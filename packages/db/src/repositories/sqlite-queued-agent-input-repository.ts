import type { DatabaseSync } from "node:sqlite";
import type {
  AgentThinkingLevel,
  QueuedAgentInputRecord,
} from "@cocurdex/shared";
import { mapMessage } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { QueuedAgentInputRepository } from "./queued-agent-input-repository";

function isThinkingLevel(value: unknown): value is AgentThinkingLevel {
  return (
    typeof value === "string" &&
    [
      "default",
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ].includes(value)
  );
}

function mapQueuedAgentInput(row: SqliteRow): QueuedAgentInputRecord {
  const thinkingLevel = row.thinking_level;
  return {
    messageId: String(row.message_id),
    sessionId: String(row.session_id),
    workspaceRootPath: String(row.workspace_root_path),
    ...(isThinkingLevel(thinkingLevel) ? { thinkingLevel } : {}),
    createdAt: String(row.created_at),
  };
}

export function createSqliteQueuedAgentInputRepository(
  database: DatabaseSync,
): QueuedAgentInputRepository {
  return {
    async list() {
      const rows = database
        .prepare("SELECT * FROM queued_agent_inputs ORDER BY sequence ASC")
        .all() as SqliteRow[];
      return rows.map(mapQueuedAgentInput);
    },
    async listBySessionId(sessionId) {
      const rows = database
        .prepare(
          `SELECT * FROM queued_agent_inputs
           WHERE session_id = ?
           ORDER BY sequence ASC`,
        )
        .all(sessionId) as SqliteRow[];
      return rows.map(mapQueuedAgentInput);
    },
    async listMessagesBySessionId(sessionId) {
      const rows = database
        .prepare(
          `SELECT messages.*,
                  queued.workspace_root_path AS queued_workspace_root_path,
                  queued.thinking_level AS queued_thinking_level
           FROM queued_agent_inputs AS queued
           JOIN messages ON messages.id = queued.message_id
                        AND messages.session_id = queued.session_id
           WHERE queued.session_id = ?
           ORDER BY queued.sequence ASC`,
        )
        .all(sessionId) as SqliteRow[];
      return rows.map((row) => ({
        message: mapMessage(row),
        workspaceRootPath: String(row.queued_workspace_root_path),
        thinkingLevel: isThinkingLevel(row.queued_thinking_level)
          ? row.queued_thinking_level
          : undefined,
      }));
    },
    async enqueue(input) {
      database
        .prepare(
          `INSERT INTO queued_agent_inputs (
             message_id, session_id, workspace_root_path, thinking_level, created_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(message_id) DO UPDATE SET
             session_id = excluded.session_id,
             workspace_root_path = excluded.workspace_root_path,
             thinking_level = excluded.thinking_level,
             created_at = excluded.created_at`,
        )
        .run(
          input.messageId,
          input.sessionId,
          input.workspaceRootPath,
          input.thinkingLevel ?? null,
          input.createdAt,
        );
    },
    async delete(messageId) {
      database
        .prepare("DELETE FROM queued_agent_inputs WHERE message_id = ?")
        .run(messageId);
    },
  };
}
