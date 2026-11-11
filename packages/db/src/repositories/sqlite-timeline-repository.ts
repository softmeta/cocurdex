import type { DatabaseSync } from "node:sqlite";
import type {
  TimelineEntrySize,
  TimelineRepository,
} from "./timeline-repository";

interface EntrySizeRow {
  seq: number;
  bytes: number | null;
  turn_start: number;
}

export function createSqliteTimelineRepository(
  database: DatabaseSync,
): TimelineRepository {
  const statement = database.prepare(
    `SELECT seq, bytes, turn_start FROM (
       SELECT seq,
              LENGTH(content) + LENGTH(attachments_json) AS bytes,
              CASE WHEN role = 'user' THEN 1 ELSE 0 END AS turn_start
       FROM messages
       WHERE session_id = ? AND seq < COALESCE(?, seq + 1)
       UNION ALL
       SELECT seq,
              LENGTH(title) + COALESCE(LENGTH(raw_input_json), 0)
                + COALESCE(LENGTH(locations_json), 0)
                + COALESCE(LENGTH(subagent_json), 0) AS bytes,
              0 AS turn_start
       FROM tool_calls
       WHERE session_id = ? AND seq < COALESCE(?, seq + 1)
     )
     ORDER BY seq DESC`,
  );
  return {
    listEntrySizesNewestFirst(sessionId, beforeSeq) {
      const rows = statement.all(
        sessionId,
        beforeSeq,
        sessionId,
        beforeSeq,
      ) as unknown as EntrySizeRow[];
      return rows.map(
        (row): TimelineEntrySize => ({
          seq: Number(row.seq),
          bytes: Number(row.bytes ?? 0),
          turnStart: row.turn_start === 1,
        }),
      );
    },
  };
}
