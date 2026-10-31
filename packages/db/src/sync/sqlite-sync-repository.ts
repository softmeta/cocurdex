import type { DatabaseSync } from "node:sqlite";
import type { SqliteRow } from "../sqlite-types";
import type {
  SyncRepository,
  SyncTombstone,
  SyncTombstoneEntity,
} from "./sync-repository";

const TOMBSTONE_ENTITIES = new Set<string>([
  "session",
  "message",
  "turnChangeSet",
]);

function mapTombstone(row: SqliteRow): SyncTombstone | null {
  const entity = String(row.entity);
  if (!TOMBSTONE_ENTITIES.has(entity)) return null;
  return {
    changeSeq: Number(row.change_seq),
    entity: entity as SyncTombstoneEntity,
    entityId: String(row.entity_id),
    sessionId: typeof row.session_id === "string" ? row.session_id : null,
  };
}

export function createSqliteSyncRepository(
  database: DatabaseSync,
): SyncRepository {
  return {
    readClock() {
      const row = database
        .prepare(
          "SELECT seq, database_id, tombstone_floor FROM sync_clock WHERE id = 1",
        )
        .get() as SqliteRow;
      return {
        databaseId: String(row.database_id),
        seq: Number(row.seq),
        tombstoneFloor: Number(row.tombstone_floor),
      };
    },
    listTombstonesSince(changeSeq) {
      const rows = database
        .prepare(
          `SELECT * FROM sync_tombstones
           WHERE change_seq > ?
           ORDER BY change_seq`,
        )
        .all(changeSeq) as SqliteRow[];
      return rows.flatMap((row) => mapTombstone(row) ?? []);
    },
    hasTurnChangeSetsChangedSince(sessionId, changeSeq) {
      const row = database
        .prepare(
          `SELECT 1 AS changed FROM turn_change_sets
           WHERE session_id = ? AND change_seq > ?
           LIMIT 1`,
        )
        .get(sessionId, changeSeq);
      return row !== undefined;
    },
    pruneTombstones(deletedBefore) {
      const newest = database
        .prepare(
          `SELECT MAX(change_seq) AS seq FROM sync_tombstones
           WHERE deleted_at < ?`,
        )
        .get(deletedBefore) as { seq?: number | null } | undefined;
      if (newest?.seq == null) return 0;
      database.exec("BEGIN");
      try {
        const result = database
          .prepare("DELETE FROM sync_tombstones WHERE change_seq <= ?")
          .run(newest.seq);
        database
          .prepare(
            "UPDATE sync_clock SET tombstone_floor = MAX(tombstone_floor, ?) WHERE id = 1",
          )
          .run(newest.seq);
        database.exec("COMMIT");
        return Number(result.changes);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
