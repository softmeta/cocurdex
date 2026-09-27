import type { DatabaseSync } from "node:sqlite";

interface TableInfoRow {
  name?: string;
}

interface UnsequencedRow {
  session_id: string;
  source: "message" | "tool_call";
  id: string;
}

interface SessionSeqRow {
  session_id: string;
  max_seq: number | null;
}

function hasColumn(database: DatabaseSync, table: string, column: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as
    | TableInfoRow[]
    | undefined;
  return Boolean(columns?.some((entry) => entry.name === column));
}

function hasTable(database: DatabaseSync, table: string) {
  return Boolean(
    database
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(table),
  );
}

function addMissingColumns(database: DatabaseSync) {
  if (!hasColumn(database, "sessions", "timeline_seq")) {
    database.exec(
      "ALTER TABLE sessions ADD COLUMN timeline_seq INTEGER NOT NULL DEFAULT 0",
    );
  }
  for (const column of ["imported_provider_session_id", "imported_at"]) {
    if (!hasColumn(database, "sessions", column)) {
      database.exec(`ALTER TABLE sessions ADD COLUMN ${column} TEXT`);
    }
  }
  if (!hasColumn(database, "messages", "seq")) {
    database.exec("ALTER TABLE messages ADD COLUMN seq INTEGER");
  }
  if (!hasColumn(database, "tool_calls", "seq")) {
    database.exec("ALTER TABLE tool_calls ADD COLUMN seq INTEGER");
  }
}

function backfillMissingSeq(database: DatabaseSync) {
  const rows = database
    .prepare(
      `SELECT session_id, source, id FROM (
         SELECT session_id, 'message' AS source, id, created_at AS at,
                0 AS priority, rowid AS row_order
         FROM messages WHERE seq IS NULL
         UNION ALL
         SELECT session_id, 'tool_call' AS source, id, started_at AS at,
                1 AS priority, rowid AS row_order
         FROM tool_calls WHERE seq IS NULL
       )
       ORDER BY session_id, at, priority, row_order`,
    )
    .all() as unknown as UnsequencedRow[];
  if (rows.length === 0) {
    return;
  }

  const maxSeqs = database
    .prepare(
      `SELECT session_id, MAX(seq) AS max_seq FROM (
         SELECT session_id, seq FROM messages
         UNION ALL
         SELECT session_id, seq FROM tool_calls
         UNION ALL
         SELECT id AS session_id, timeline_seq AS seq FROM sessions
       )
       GROUP BY session_id`,
    )
    .all() as unknown as SessionSeqRow[];
  const nextSeqBySession = new Map(
    maxSeqs.map((row) => [row.session_id, (row.max_seq ?? 0) + 1]),
  );

  const updateMessage = database.prepare(
    "UPDATE messages SET seq = ? WHERE id = ?",
  );
  const updateToolCall = database.prepare(
    "UPDATE tool_calls SET seq = ? WHERE id = ?",
  );
  for (const row of rows) {
    const seq = nextSeqBySession.get(row.session_id) ?? 1;
    nextSeqBySession.set(row.session_id, seq + 1);
    const update = row.source === "message" ? updateMessage : updateToolCall;
    update.run(seq, row.id);
  }
}

function syncSessionCounters(database: DatabaseSync) {
  database.exec(`
    UPDATE sessions
    SET timeline_seq = MAX(
      timeline_seq,
      COALESCE((SELECT MAX(seq) FROM messages WHERE session_id = sessions.id), 0),
      COALESCE((SELECT MAX(seq) FROM tool_calls WHERE session_id = sessions.id), 0)
    )
  `);
}

function createIndexes(database: DatabaseSync) {
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_seq
      ON messages(session_id, seq);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_calls_session_seq
      ON tool_calls(session_id, seq);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_imported_provider_session
      ON sessions(agent_type, imported_provider_session_id)
      WHERE imported_provider_session_id IS NOT NULL;
  `);
}

export function ensureTimelineSequence(database: DatabaseSync): void {
  if (
    !hasTable(database, "sessions") ||
    !hasTable(database, "messages") ||
    !hasTable(database, "tool_calls")
  ) {
    return;
  }
  addMissingColumns(database);
  backfillMissingSeq(database);
  syncSessionCounters(database);
  createIndexes(database);
}

export function allocateTimelineSeq(
  database: DatabaseSync,
  sessionId: string,
): number | null {
  const row = database
    .prepare(
      `UPDATE sessions SET timeline_seq = timeline_seq + 1
       WHERE id = ?
       RETURNING timeline_seq`,
    )
    .get(sessionId) as { timeline_seq?: number } | undefined;
  return typeof row?.timeline_seq === "number" ? row.timeline_seq : null;
}
