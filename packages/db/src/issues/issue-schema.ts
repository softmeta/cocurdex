import type { DatabaseSync } from "node:sqlite";

const ISSUE_COLUMN_ADDITIONS = [
  ["space_id", "TEXT NOT NULL DEFAULT 'local'"],
  ["number", "INTEGER"],
  ["parent_id", "TEXT REFERENCES issues(id) ON DELETE SET NULL"],
  ["completed_at", "TEXT"],
] as const;

function columnNames(database: DatabaseSync, table: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return new Set(rows.map((row) => row.name));
}

function backfillStatusCategories(database: DatabaseSync): void {
  database.exec(`
    UPDATE issue_columns
    SET category = CASE id
      WHEN 'backlog' THEN 'backlog'
      WHEN 'doing' THEN 'started'
      WHEN 'review' THEN 'started'
      WHEN 'done' THEN 'completed'
      ELSE 'unstarted'
    END
    WHERE field = 'status' AND category IS NULL
  `);
}

function backfillIssueNumbers(database: DatabaseSync): void {
  const missing = database
    .prepare(
      `SELECT id, space_id FROM issues
       WHERE number IS NULL
       ORDER BY created_at, id`,
    )
    .all() as { id: string; space_id: string }[];
  const next = database.prepare(
    "SELECT COALESCE(MAX(number), 0) + 1 AS number FROM issues WHERE space_id = ?",
  );
  const assign = database.prepare("UPDATE issues SET number = ? WHERE id = ?");
  for (const row of missing) {
    const { number } = next.get(row.space_id) as { number: number };
    assign.run(number, row.id);
  }
}

function backfillCompletedAt(database: DatabaseSync): void {
  database.exec(`
    UPDATE issues
    SET completed_at = updated_at
    WHERE completed_at IS NULL
      AND status IN (
        SELECT id FROM issue_columns
        WHERE field = 'status' AND category IN ('completed', 'canceled')
      )
  `);
}

export function migrateIssuesToAgentCore(database: DatabaseSync): void {
  const issueColumns = columnNames(database, "issues");
  for (const [name, definition] of ISSUE_COLUMN_ADDITIONS) {
    if (!issueColumns.has(name)) {
      database.exec(`ALTER TABLE issues ADD COLUMN ${name} ${definition}`);
    }
  }
  if (!columnNames(database, "issue_columns").has("category")) {
    database.exec("ALTER TABLE issue_columns ADD COLUMN category TEXT");
  }
  backfillStatusCategories(database);
  backfillIssueNumbers(database);
  backfillCompletedAt(database);
}

export function ensureIssueIndexes(database: DatabaseSync): void {
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_space_number
      ON issues(space_id, number);

    CREATE INDEX IF NOT EXISTS idx_issues_parent
      ON issues(parent_id);
  `);
}
