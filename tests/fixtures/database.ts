import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

const fixtureRoot = path.dirname(
  createRequire(import.meta.url).resolve(
    "@cocurdex/test-fixtures/db/schema-v5.sql",
  ),
);

export const historicalSchemaVersions = [
  5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
  26, 27, 28, 29, 30, 31, 32, 33,
];

export function seedHistoricalDatabase(
  database: DatabaseSync,
  version: number,
  workspacePath: string,
) {
  database.exec(
    readFileSync(path.join(fixtureRoot, `schema-v${version}.sql`), "utf8"),
  );
  const now = "2026-06-25T00:00:00.000Z";
  const insert = (table: string, values: Record<string, SQLInputValue>) => {
    const columns = new Set(
      database
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name),
    );
    const entries = Object.entries(values).filter(([column]) =>
      columns.has(column),
    );
    database
      .prepare(
        `INSERT INTO ${table} (${entries.map(([column]) => column).join(", ")}) VALUES (${entries.map(() => "?").join(", ")})`,
      )
      .run(...entries.map(([, value]) => value));
  };
  insert("workspaces", {
    id: "historical-workspace",
    name: "acme-shop",
    root_path: workspacePath,
    root_paths: JSON.stringify([workspacePath]),
    created_at: now,
    updated_at: now,
    last_opened_at: now,
  });
  insert("sessions", {
    id: "historical-session",
    workspace_id: "historical-workspace",
    title: "Migration session",
    agent_type: "codex",
    status: "idle",
    write_mode: "read-only",
    collaboration_mode: "plan",
    session_mode_id: "plan",
    created_at: now,
    updated_at: now,
  });
  insert("messages", {
    id: "historical-message",
    session_id: "historical-session",
    role: "user",
    content: "Keep this conversation",
    attachments_json: "[]",
    created_at: now,
  });
  insert("notes", {
    id: "historical-note",
    workspace_id: "historical-workspace",
    kind: "note",
    title: "Migration note",
    body_markdown: "Preserved note body",
    created_at: now,
    updated_at: now,
  });
  insert("issues", {
    id: "historical-issue",
    workspace_id: "historical-workspace",
    title: "Migration issue",
    description_markdown: "Preserved issue body",
    created_at: now,
    updated_at: now,
  });
}
