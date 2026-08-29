import type { DatabaseSync } from "node:sqlite";
import type {
  SearchDocumentKind,
  SearchDocumentResult,
  SearchDocumentsPayload,
} from "@cocurdex/shared";
import type { SearchRepository } from "./search-repository";

interface SearchRow {
  id: string;
  title: string;
  excerpt: string;
  rank: number;
}

function quoteFtsQuery(query: string): string {
  return `"${query.replaceAll('"', '""')}"`;
}

function workspaceFilter(
  workspaceId: string | null | undefined,
  column: string,
) {
  return workspaceId === undefined
    ? { sql: "", parameters: [] }
    : { sql: ` AND ${column} IS ?`, parameters: [workspaceId] };
}

function searchNotes(
  database: DatabaseSync,
  payload: SearchDocumentsPayload,
): SearchDocumentResult[] {
  const query = payload.query.trim();
  const workspace = workspaceFilter(payload.workspaceId, "workspace_id");
  const limit = payload.limit ?? 50;
  const rows =
    Array.from(query).length < 3
      ? (database
          .prepare(
            `SELECT id, title,
                    substr(body_markdown, 1, 240) AS excerpt,
                    0 AS rank
             FROM notes
             WHERE kind = 'note'
               ${workspace.sql}
               AND (title LIKE ? OR body_markdown LIKE ?)
             ORDER BY updated_at DESC
             LIMIT ?`,
          )
          .all(
            ...workspace.parameters,
            `%${query}%`,
            `%${query}%`,
            limit,
          ) as unknown as SearchRow[])
      : (database
          .prepare(
            `SELECT notes.id, notes.title,
                    snippet(note_fts, 2, '', '', '…', 24) AS excerpt,
                    bm25(note_fts) AS rank
             FROM note_fts
             JOIN notes ON notes.id = note_fts.note_id
             WHERE note_fts MATCH ?
               ${workspaceFilter(payload.workspaceId, "notes.workspace_id").sql}
             ORDER BY rank
             LIMIT ?`,
          )
          .all(
            quoteFtsQuery(query),
            ...workspace.parameters,
            limit,
          ) as unknown as SearchRow[]);
  return rows.map((row) => ({ ...row, kind: "note" }));
}

function searchIssues(
  database: DatabaseSync,
  payload: SearchDocumentsPayload,
): SearchDocumentResult[] {
  const query = payload.query.trim();
  const workspace = workspaceFilter(payload.workspaceId, "workspace_id");
  const limit = payload.limit ?? 50;
  const rows =
    Array.from(query).length < 3
      ? (database
          .prepare(
            `SELECT id, title,
                    substr(description_markdown, 1, 240) AS excerpt,
                    0 AS rank
             FROM issues
             WHERE 1 = 1
               ${workspace.sql}
               AND (title LIKE ? OR description_markdown LIKE ?)
             ORDER BY updated_at DESC
             LIMIT ?`,
          )
          .all(
            ...workspace.parameters,
            `%${query}%`,
            `%${query}%`,
            limit,
          ) as unknown as SearchRow[])
      : (database
          .prepare(
            `SELECT issues.id, issues.title,
                    snippet(issue_fts, 2, '', '', '…', 24) AS excerpt,
                    bm25(issue_fts) AS rank
             FROM issue_fts
             JOIN issues ON issues.id = issue_fts.issue_id
             WHERE issue_fts MATCH ?
               ${workspaceFilter(payload.workspaceId, "issues.workspace_id").sql}
             ORDER BY rank
             LIMIT ?`,
          )
          .all(
            quoteFtsQuery(query),
            ...workspace.parameters,
            limit,
          ) as unknown as SearchRow[]);
  return rows.map((row) => ({ ...row, kind: "issue" }));
}

export function createSqliteSearchRepository(
  database: DatabaseSync,
): SearchRepository {
  return {
    async search(payload) {
      const query = payload.query.trim();
      if (!query) {
        return [];
      }
      const kinds = new Set<SearchDocumentKind>(
        payload.kinds ?? ["note", "issue"],
      );
      const results = [
        ...(kinds.has("note") ? searchNotes(database, payload) : []),
        ...(kinds.has("issue") ? searchIssues(database, payload) : []),
      ];
      return results
        .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
        .slice(0, payload.limit ?? 50);
    },
  };
}
