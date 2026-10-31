import type { DatabaseSync } from "node:sqlite";
import type { AgentId, RunRecord } from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import type { RunRepository } from "./run-repository";

function mapRun(row: SqliteRow): RunRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    triggerMessageId: String(row.trigger_message_id),
    status: row.status as RunRecord["status"],
    error: typeof row.error === "string" ? row.error : null,
    startedAt: String(row.started_at),
    endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
    agentType:
      typeof row.agent_type === "string" ? (row.agent_type as AgentId) : null,
  };
}

export function createSqliteRunRepository(
  database: DatabaseSync,
): RunRepository {
  const getById = (runId: string) => {
    const row = database
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get(runId) as SqliteRow | undefined;
    return row ? mapRun(row) : null;
  };
  return {
    insert(run) {
      database
        .prepare(
          `INSERT INTO runs (
             id, session_id, trigger_message_id, status, error, started_at,
             ended_at, agent_type
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          run.id,
          run.sessionId,
          run.triggerMessageId,
          run.status,
          run.error ?? null,
          run.startedAt,
          run.endedAt ?? null,
          run.agentType ?? null,
        );
      return getById(run.id) ?? run;
    },
    getById,
    getActiveBySessionId(sessionId) {
      const row = database
        .prepare(
          "SELECT * FROM runs WHERE session_id = ? AND status = 'running' LIMIT 1",
        )
        .get(sessionId) as SqliteRow | undefined;
      return row ? mapRun(row) : null;
    },
    listActive() {
      const rows = database
        .prepare(
          "SELECT * FROM runs WHERE status = 'running' ORDER BY started_at ASC",
        )
        .all() as SqliteRow[];
      return rows.map(mapRun);
    },
    listBySessionId(sessionId) {
      const rows = database
        .prepare(
          "SELECT * FROM runs WHERE session_id = ? ORDER BY started_at ASC, rowid ASC",
        )
        .all(sessionId) as SqliteRow[];
      return rows.map(mapRun);
    },
    finish(runId, status, endedAt, error) {
      const row = database
        .prepare(
          `UPDATE runs SET status = ?, error = ?, ended_at = ?
           WHERE id = ? AND status = 'running'
           RETURNING *`,
        )
        .get(status, error ?? null, endedAt, runId) as SqliteRow | undefined;
      return row ? mapRun(row) : null;
    },
    interruptRunning(endedAt) {
      const rows = database
        .prepare(
          `UPDATE runs SET status = 'interrupted', ended_at = ?
           WHERE status = 'running'
           RETURNING *`,
        )
        .all(endedAt) as SqliteRow[];
      const runs = rows.map(mapRun);
      const sessions = database
        .prepare(
          `UPDATE sessions SET status = 'idle', updated_at = ?
           WHERE status = 'running'
           RETURNING id`,
        )
        .all(endedAt) as Array<{ id: string }>;
      const sessionIds = new Set([
        ...runs.map((run) => run.sessionId),
        ...sessions.map((session) => session.id),
      ]);
      return { runs, sessionIds: [...sessionIds] };
    },
  };
}
