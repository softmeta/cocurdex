import type { DatabaseSync } from "node:sqlite";
import type { AgentId, ContextTransferRecord } from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import type { ContextTransferRepository } from "./context-transfer-repository";

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseAgentTypes(value: unknown): AgentId[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is AgentId => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function mapContextTransfer(row: SqliteRow): ContextTransferRecord {
  return {
    id: String(row.id),
    kind: row.kind as ContextTransferRecord["kind"],
    sourceSessionId: String(row.source_session_id),
    targetSessionId: String(row.target_session_id),
    sourceMessageId: nullableString(row.source_message_id),
    sourceAgentTypes: parseAgentTypes(row.source_agent_types_json),
    targetAgentType: nullableString(row.target_agent_type) as AgentId | null,
    status: row.status as ContextTransferRecord["status"],
    strategy: nullableString(row.strategy) as ContextTransferRecord["strategy"],
    coveredMessageCount: Number(row.covered_message_count ?? 0),
    handoffText: nullableString(row.handoff_text),
    consumedByMessageId: nullableString(row.consumed_by_message_id),
    createdAt: String(row.created_at),
    consumedAt: nullableString(row.consumed_at),
  };
}

export function createSqliteContextTransferRepository(
  database: DatabaseSync,
): ContextTransferRepository {
  return {
    insert(record) {
      database
        .prepare(
          `INSERT INTO context_transfers (
             id, kind, source_session_id, target_session_id, source_message_id,
             source_agent_types_json, target_agent_type, status, strategy,
             covered_message_count, handoff_text, consumed_by_message_id,
             created_at, consumed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.kind,
          record.sourceSessionId,
          record.targetSessionId,
          record.sourceMessageId,
          JSON.stringify(record.sourceAgentTypes),
          record.targetAgentType,
          record.status,
          record.strategy,
          record.coveredMessageCount,
          record.handoffText,
          record.consumedByMessageId,
          record.createdAt,
          record.consumedAt,
        );
    },
    listByTargetSession(sessionId) {
      const rows = database
        .prepare(
          `SELECT * FROM context_transfers
           WHERE target_session_id = ?
           ORDER BY created_at ASC, rowid ASC`,
        )
        .all(sessionId) as SqliteRow[];
      return rows.map(mapContextTransfer);
    },
    findPending(sessionId) {
      const row = database
        .prepare(
          `SELECT * FROM context_transfers
           WHERE target_session_id = ? AND status = 'pending'
           ORDER BY created_at ASC, rowid ASC LIMIT 1`,
        )
        .get(sessionId) as SqliteRow | undefined;
      return row ? mapContextTransfer(row) : null;
    },
    consume(id, consumption) {
      database
        .prepare(
          `UPDATE context_transfers SET
             status = 'consumed', target_agent_type = ?,
             source_agent_types_json = ?, strategy = ?,
             covered_message_count = ?, handoff_text = ?,
             consumed_by_message_id = ?, consumed_at = ?
           WHERE id = ?`,
        )
        .run(
          consumption.targetAgentType,
          JSON.stringify(consumption.sourceAgentTypes),
          consumption.strategy,
          consumption.coveredMessageCount,
          consumption.handoffText,
          consumption.consumedByMessageId,
          consumption.consumedAt,
          id,
        );
    },
  };
}
