import type { DatabaseSync } from "node:sqlite";
import type {
  HostCheckpointKind,
  TurnChangeSet,
  TurnFileChange,
} from "@cocurdex/shared";
import {
  parseJson,
  type SqliteRow,
  toNullableNumber,
  toNullableString,
} from "../sqlite-types";
import type { TurnChangeSetRepository } from "./turn-change-set-repository";

function mapTurnChangeSet(row: SqliteRow): TurnChangeSet {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    messageId: String(row.message_id),
    userMessageId: String(row.user_message_id),
    providerTurnId: toNullableString(row.provider_turn_id),
    source: row.source as TurnChangeSet["source"],
    coverage: row.coverage as TurnChangeSet["coverage"],
    files: parseJson<TurnFileChange[]>(row.files_json, []),
    additions: toNullableNumber(row.additions),
    deletions: toNullableNumber(row.deletions),
    nativeCheckpointRef: toNullableString(row.native_checkpoint_ref),
    hostBeforeCheckpointRef: toNullableString(row.host_before_checkpoint_ref),
    hostBeforeCheckpointKind: toNullableString(
      row.host_before_checkpoint_kind,
    ) as HostCheckpointKind | null,
    hostAfterCheckpointRef: toNullableString(row.host_after_checkpoint_ref),
    hostAfterCheckpointKind: toNullableString(
      row.host_after_checkpoint_kind,
    ) as HostCheckpointKind | null,
    hostRecoveryCheckpointRef: toNullableString(
      row.host_recovery_checkpoint_ref,
    ),
    hostRecoveryCheckpointKind: toNullableString(
      row.host_recovery_checkpoint_kind,
    ) as HostCheckpointKind | null,
    outcome: toNullableString(row.outcome) as TurnChangeSet["outcome"],
    nativeFiles: parseJson<TurnFileChange[] | null>(
      row.native_files_json,
      null,
    ),
    undoable: row.undoable == null ? null : Number(row.undoable) === 1,
    status: row.status as TurnChangeSet["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function changeSetLookupKey(changeSet: TurnChangeSet) {
  return changeSet.messageId || changeSet.userMessageId;
}

export function createSqliteTurnChangeSetRepository(
  database: DatabaseSync,
): TurnChangeSetRepository {
  return {
    async listBySessionId(sessionId) {
      const rows = database
        .prepare(
          `SELECT *
           FROM turn_change_sets
           WHERE session_id = ?
           ORDER BY created_at ASC`,
        )
        .all(sessionId) as SqliteRow[];

      return Object.fromEntries(
        rows.map((row) => {
          const changeSet = mapTurnChangeSet(row);
          return [changeSetLookupKey(changeSet), changeSet];
        }),
      );
    },
    async getByMessageId(sessionId, messageId) {
      const row = database
        .prepare(
          `SELECT *
           FROM turn_change_sets
           WHERE session_id = ? AND message_id = ?
           LIMIT 1`,
        )
        .get(sessionId, messageId) as SqliteRow | undefined;
      return row ? mapTurnChangeSet(row) : null;
    },
    async getByUserMessageId(sessionId, userMessageId) {
      const row = database
        .prepare(
          `SELECT *
           FROM turn_change_sets
           WHERE session_id = ? AND user_message_id = ?
           LIMIT 1`,
        )
        .get(sessionId, userMessageId) as SqliteRow | undefined;
      return row ? mapTurnChangeSet(row) : null;
    },
    async getById(id) {
      const row = database
        .prepare(
          `SELECT *
           FROM turn_change_sets
           WHERE id = ?
           LIMIT 1`,
        )
        .get(id) as SqliteRow | undefined;
      return row ? mapTurnChangeSet(row) : null;
    },
    async listAll() {
      const rows = database
        .prepare(
          `SELECT *
           FROM turn_change_sets
           ORDER BY created_at ASC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapTurnChangeSet);
    },
    async upsert(changeSet) {
      database
        .prepare(
          `INSERT INTO turn_change_sets (
             id, session_id, message_id, user_message_id, provider_turn_id,
             source, coverage, files_json, additions, deletions,
             native_checkpoint_ref, host_before_checkpoint_ref,
             host_before_checkpoint_kind, host_after_checkpoint_ref,
             host_after_checkpoint_kind, host_recovery_checkpoint_ref,
             host_recovery_checkpoint_kind, outcome, native_files_json,
             undoable, status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id, user_message_id) DO UPDATE SET
             id = excluded.id,
             message_id = excluded.message_id,
             provider_turn_id = excluded.provider_turn_id,
             source = excluded.source,
             coverage = excluded.coverage,
             files_json = excluded.files_json,
             additions = excluded.additions,
             deletions = excluded.deletions,
             native_checkpoint_ref = excluded.native_checkpoint_ref,
             host_before_checkpoint_ref = excluded.host_before_checkpoint_ref,
             host_before_checkpoint_kind = excluded.host_before_checkpoint_kind,
             host_after_checkpoint_ref = excluded.host_after_checkpoint_ref,
             host_after_checkpoint_kind = excluded.host_after_checkpoint_kind,
             host_recovery_checkpoint_ref = excluded.host_recovery_checkpoint_ref,
             host_recovery_checkpoint_kind = excluded.host_recovery_checkpoint_kind,
             outcome = excluded.outcome,
             native_files_json = excluded.native_files_json,
             undoable = excluded.undoable,
             status = excluded.status,
             updated_at = excluded.updated_at`,
        )
        .run(
          changeSet.id,
          changeSet.sessionId,
          changeSet.messageId,
          changeSet.userMessageId,
          changeSet.providerTurnId ?? null,
          changeSet.source,
          changeSet.coverage,
          JSON.stringify(changeSet.files),
          changeSet.additions ?? null,
          changeSet.deletions ?? null,
          changeSet.nativeCheckpointRef ?? null,
          changeSet.hostBeforeCheckpointRef ?? null,
          changeSet.hostBeforeCheckpointKind ?? null,
          changeSet.hostAfterCheckpointRef ?? null,
          changeSet.hostAfterCheckpointKind ?? null,
          changeSet.hostRecoveryCheckpointRef ?? null,
          changeSet.hostRecoveryCheckpointKind ?? null,
          changeSet.outcome ?? null,
          changeSet.nativeFiles ? JSON.stringify(changeSet.nativeFiles) : null,
          changeSet.undoable == null ? null : changeSet.undoable ? 1 : 0,
          changeSet.status,
          changeSet.createdAt,
          changeSet.updatedAt,
        );
    },
    async deleteById(id) {
      database.prepare("DELETE FROM turn_change_sets WHERE id = ?").run(id);
    },
    async deleteBySessionId(sessionId) {
      database
        .prepare("DELETE FROM turn_change_sets WHERE session_id = ?")
        .run(sessionId);
    },
  };
}
