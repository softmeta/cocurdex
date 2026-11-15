import type { DatabaseSync } from "node:sqlite";
import { FOLLOW_UP_STATUSES, type FollowUpRecord } from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import type { FollowUpRepository } from "./follow-up-repository";

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function mapFollowUp(row: SqliteRow): FollowUpRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    dueAt: String(row.due_at),
    note: String(row.note),
    status:
      FOLLOW_UP_STATUSES.find((status) => status === row.status) ?? "canceled",
    createdAt: String(row.created_at),
    firedAt: nullableString(row.fired_at),
    canceledAt: nullableString(row.canceled_at),
  };
}

export function createSqliteFollowUpRepository(
  database: DatabaseSync,
): FollowUpRepository {
  const select = (sql: string, ...values: string[]) =>
    (database.prepare(sql).all(...values) as SqliteRow[]).map(mapFollowUp);
  return {
    listByAgent(agentId, status) {
      return status
        ? select(
            "SELECT * FROM follow_ups WHERE agent_id = ? AND status = ? ORDER BY due_at ASC, id ASC",
            agentId,
            status,
          )
        : select(
            "SELECT * FROM follow_ups WHERE agent_id = ? ORDER BY due_at ASC, id ASC",
            agentId,
          );
    },
    listPending() {
      return select(
        "SELECT * FROM follow_ups WHERE status = 'pending' ORDER BY due_at ASC, id ASC",
      );
    },
    getById(id) {
      return select("SELECT * FROM follow_ups WHERE id = ?", id)[0] ?? null;
    },
    insert(followUp) {
      database
        .prepare(
          `INSERT INTO follow_ups (
             id, agent_id, due_at, note, status, created_at, fired_at, canceled_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          followUp.id,
          followUp.agentId,
          followUp.dueAt,
          followUp.note,
          followUp.status,
          followUp.createdAt,
          followUp.firedAt,
          followUp.canceledAt,
        );
    },
    markFired(id, firedAt) {
      const result = database
        .prepare(
          "UPDATE follow_ups SET status = 'fired', fired_at = ? WHERE id = ? AND status = 'pending'",
        )
        .run(firedAt, id);
      return Number(result.changes) > 0;
    },
    cancel(id, canceledAt) {
      const result = database
        .prepare(
          "UPDATE follow_ups SET status = 'canceled', canceled_at = ? WHERE id = ? AND status = 'pending'",
        )
        .run(canceledAt, id);
      return Number(result.changes) > 0;
    },
    deleteByAgent(agentId) {
      database
        .prepare("DELETE FROM follow_ups WHERE agent_id = ?")
        .run(agentId);
    },
  };
}
