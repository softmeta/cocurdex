import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  IssueLabel,
  IssueRelation,
  IssueRelationKind,
  IssueSessionLink,
  IssueStatusCategory,
  IssueSummary,
} from "@cocurdex/shared";
import { getIssue, type IssueRow, toIssueSummary } from "./issue-storage";

export class IssueLabelNotFoundError extends Error {
  constructor(id: string) {
    super(`Issue label not found: ${id}`);
    this.name = "IssueLabelNotFoundError";
  }
}

export function requireLabel(database: DatabaseSync, id: string): IssueLabel {
  const row = database
    .prepare(
      "SELECT id, name, color FROM issue_labels WHERE id = ? OR name = ? COLLATE NOCASE",
    )
    .get(id, id) as IssueLabel | undefined;
  if (!row) {
    throw new IssueLabelNotFoundError(id);
  }
  return { id: row.id, name: row.name, color: row.color };
}

export function resolveLabelIds(
  database: DatabaseSync,
  refs: readonly string[],
): string[] {
  return [...new Set(refs.map((ref) => requireLabel(database, ref).id))];
}

export function insertLabel(
  database: DatabaseSync,
  name: string,
  color: string | null,
): IssueLabel {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Issue label name is required");
  }
  const existing = database
    .prepare(
      "SELECT id FROM issue_labels WHERE name = ? COLLATE NOCASE LIMIT 1",
    )
    .get(trimmed) as { id: string } | undefined;
  if (existing) {
    throw new Error(`Issue label already exists: ${trimmed}`);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO issue_labels (id, name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, trimmed, color, now, now);
  return { id, name: trimmed, color };
}

export function replaceIssueLabels(
  database: DatabaseSync,
  issueId: string,
  labelIds: readonly string[],
): void {
  database
    .prepare("DELETE FROM issue_label_links WHERE issue_id = ?")
    .run(issueId);
  const insert = database.prepare(
    "INSERT INTO issue_label_links (issue_id, label_id) VALUES (?, ?)",
  );
  for (const labelId of labelIds) {
    insert.run(issueId, labelId);
  }
}

export function assertValidParent(
  database: DatabaseSync,
  issueId: string | null,
  parent: IssueRow,
): void {
  let cursor: IssueRow | null = parent;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor.id === issueId) {
      throw new Error("An issue cannot be its own ancestor");
    }
    if (seen.has(cursor.id)) {
      return;
    }
    seen.add(cursor.id);
    cursor = cursor.parent_id ? getIssue(database, cursor.parent_id) : null;
  }
}

export function listChildIssues(
  database: DatabaseSync,
  issueId: string,
  categories: Map<string, IssueStatusCategory | null>,
): IssueSummary[] {
  return (
    database
      .prepare(
        `SELECT * FROM issues
         WHERE parent_id = ?
         ORDER BY number, id`,
      )
      .all(issueId) as IssueRow[]
  ).map((row) => toIssueSummary(row, categories));
}

function relationMatchSql(kind: IssueRelationKind) {
  return kind === "related"
    ? `kind = 'related' AND (
         (issue_id = ? AND related_issue_id = ?) OR
         (issue_id = ? AND related_issue_id = ?)
       )`
    : `kind = '${kind}' AND issue_id = ? AND related_issue_id = ?`;
}

function relationMatchArgs(
  kind: IssueRelationKind,
  issueId: string,
  relatedId: string,
) {
  return kind === "related"
    ? [issueId, relatedId, relatedId, issueId]
    : [issueId, relatedId];
}

export function insertRelation(
  database: DatabaseSync,
  issueId: string,
  kind: IssueRelationKind,
  relatedId: string,
): boolean {
  if (issueId === relatedId) {
    throw new Error("An issue cannot relate to itself");
  }
  const exists = database
    .prepare(`SELECT 1 FROM issue_relations WHERE ${relationMatchSql(kind)}`)
    .get(...relationMatchArgs(kind, issueId, relatedId));
  if (exists) {
    return false;
  }
  database
    .prepare(
      `INSERT INTO issue_relations (issue_id, related_issue_id, kind, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(issueId, relatedId, kind, new Date().toISOString());
  return true;
}

export function deleteRelation(
  database: DatabaseSync,
  issueId: string,
  kind: IssueRelationKind,
  relatedId: string,
): boolean {
  const result = database
    .prepare(`DELETE FROM issue_relations WHERE ${relationMatchSql(kind)}`)
    .run(...relationMatchArgs(kind, issueId, relatedId));
  return Number(result.changes) > 0;
}

interface RelationRow {
  issue_id: string;
  related_issue_id: string;
  kind: IssueRelationKind;
}

export function listRelations(
  database: DatabaseSync,
  issueId: string,
  categories: Map<string, IssueStatusCategory | null>,
): IssueRelation[] {
  const rows = database
    .prepare(
      `SELECT issue_id, related_issue_id, kind FROM issue_relations
       WHERE issue_id = ? OR related_issue_id = ?
       ORDER BY created_at, kind`,
    )
    .all(issueId, issueId) as unknown as RelationRow[];
  return rows.flatMap((row) => {
    const outgoing = row.issue_id === issueId;
    const other = getIssue(
      database,
      outgoing ? row.related_issue_id : row.issue_id,
    );
    if (!other) {
      return [];
    }
    return [
      {
        kind: row.kind,
        direction: outgoing ? "outgoing" : "incoming",
        issue: toIssueSummary(other, categories),
      },
    ];
  });
}

export function insertSessionLink(
  database: DatabaseSync,
  issueId: string,
  sessionId: string,
): boolean {
  const session = database
    .prepare("SELECT 1 FROM sessions WHERE id = ?")
    .get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const result = database
    .prepare(
      `INSERT INTO issue_sessions (issue_id, session_id, linked_at)
       VALUES (?, ?, ?)
       ON CONFLICT(issue_id, session_id) DO NOTHING`,
    )
    .run(issueId, sessionId, new Date().toISOString());
  return Number(result.changes) > 0;
}

interface SessionLinkRow {
  session_id: string;
  linked_at: string;
  title: string | null;
  status: string | null;
  workspace_id: string | null;
}

export function listSessionLinks(
  database: DatabaseSync,
  issueId: string,
): IssueSessionLink[] {
  const rows = database
    .prepare(
      `SELECT l.session_id, l.linked_at, s.title, s.status, s.workspace_id
       FROM issue_sessions l
       LEFT JOIN sessions s ON s.id = l.session_id
       WHERE l.issue_id = ?
       ORDER BY l.linked_at DESC`,
    )
    .all(issueId) as unknown as SessionLinkRow[];
  return rows.map((row) => ({
    sessionId: row.session_id,
    title: row.title,
    status: row.status,
    workspaceId: row.workspace_id,
    linkedAt: row.linked_at,
  }));
}
