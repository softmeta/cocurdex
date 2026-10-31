import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DeckContent, DeckRecord, DeckSummary } from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import {
  DeckConflictError,
  DeckNotFoundError,
  type DecksRepository,
} from "./decks-repository";

interface DeckRow extends SqliteRow {
  id: string;
  workspace_id: string | null;
  title: string;
  content_json: string;
  slide_count: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

const SUMMARY_COLUMNS =
  "id, workspace_id, title, slide_count, revision, created_at, updated_at";

function mapSummary(row: DeckRow): DeckSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    slideCount: row.slide_count,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecord(row: DeckRow): DeckRecord {
  return {
    ...mapSummary(row),
    content: JSON.parse(row.content_json) as DeckContent,
  };
}

export function createSqliteDecksRepository(
  database: DatabaseSync,
): DecksRepository {
  const selectRow = (id: string) =>
    database.prepare("SELECT * FROM decks WHERE id = ?").get(id) as
      | DeckRow
      | undefined;

  const requireRow = (id: string, expectedRevision?: number) => {
    const row = selectRow(id);
    if (!row) throw new DeckNotFoundError(id);
    if (expectedRevision !== undefined && row.revision !== expectedRevision) {
      throw new DeckConflictError();
    }
    return row;
  };

  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT ${SUMMARY_COLUMNS} FROM decks ORDER BY updated_at DESC, id ASC`,
        )
        .all() as DeckRow[];
      return rows.map(mapSummary);
    },

    async get(id) {
      const row = selectRow(id);
      return row ? mapRecord(row) : null;
    },

    async create(input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO decks
             (id, workspace_id, title, content_json, slide_count, revision,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          id,
          input.workspaceId,
          input.title,
          JSON.stringify(input.content),
          input.content.slides.length,
          now,
          now,
        );
      return mapRecord(requireRow(id));
    },

    async update(input) {
      const current = requireRow(input.id, input.expectedRevision);
      const content =
        input.content ?? (JSON.parse(current.content_json) as DeckContent);
      const result = database
        .prepare(
          `UPDATE decks
           SET title = ?, workspace_id = ?, content_json = ?, slide_count = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          input.title ?? current.title,
          input.workspaceId === undefined
            ? current.workspace_id
            : input.workspaceId,
          JSON.stringify(content),
          content.slides.length,
          new Date().toISOString(),
          current.id,
          current.revision,
        );
      if (result.changes === 0) throw new DeckConflictError();
      return mapRecord(requireRow(current.id));
    },

    async delete(input) {
      const current = requireRow(input.id, input.expectedRevision);
      const result = database
        .prepare("DELETE FROM decks WHERE id = ? AND revision = ?")
        .run(current.id, current.revision);
      if (result.changes === 0) throw new DeckConflictError();
    },
  };
}
