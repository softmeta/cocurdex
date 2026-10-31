import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  IssueActor,
  IssueEvent,
  IssueEventKind,
  IssueFieldChange,
  IssueRelationKind,
  IssueStatusCategory,
} from "@cocurdex/shared";
import { formatIssueIdentifier } from "@cocurdex/shared";
import {
  getIssue,
  type IssueRow,
  type LabelRow,
  toIssueSummary,
} from "./issue-storage";

export const DEFAULT_ISSUE_ACTOR: IssueActor = { kind: "user" };

interface IssueEventInput {
  issueId: string;
  kind: IssueEventKind;
  actor?: IssueActor;
  changes?: IssueFieldChange[];
  body?: string;
  relationKind?: IssueRelationKind;
  relatedIssueId?: string;
  sessionId?: string;
  createdAt?: string;
}

interface IssueEventPayload {
  changes?: IssueFieldChange[];
  body?: string;
  relationKind?: IssueRelationKind;
  relatedIssueId?: string;
  sessionId?: string;
}

interface IssueEventRow {
  id: string;
  issue_id: string;
  kind: IssueEventKind;
  actor_kind: IssueActor["kind"];
  actor_session_id: string | null;
  payload_json: string;
  created_at: string;
}

export function recordIssueEvent(
  database: DatabaseSync,
  input: IssueEventInput,
): void {
  const actor = input.actor ?? DEFAULT_ISSUE_ACTOR;
  const payload: IssueEventPayload = {
    changes: input.changes,
    body: input.body,
    relationKind: input.relationKind,
    relatedIssueId: input.relatedIssueId,
    sessionId: input.sessionId,
  };
  database
    .prepare(
      `INSERT INTO issue_events (
         id, issue_id, kind, actor_kind, actor_session_id, payload_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.issueId,
      input.kind,
      actor.kind,
      actor.sessionId ?? null,
      JSON.stringify(payload),
      input.createdAt ?? new Date().toISOString(),
    );
}

function parsePayload(raw: string): IssueEventPayload {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as IssueEventPayload)
      : {};
  } catch {
    return {};
  }
}

export function listIssueEvents(
  database: DatabaseSync,
  issueId: string,
  categories: Map<string, IssueStatusCategory | null>,
): IssueEvent[] {
  const rows = database
    .prepare(
      `SELECT * FROM issue_events
       WHERE issue_id = ?
       ORDER BY created_at, rowid`,
    )
    .all(issueId) as unknown as IssueEventRow[];
  return rows.map((row) => {
    const payload = parsePayload(row.payload_json);
    const related = payload.relatedIssueId
      ? getIssue(database, payload.relatedIssueId)
      : null;
    return {
      id: row.id,
      issueId: row.issue_id,
      kind: row.kind,
      actor: { kind: row.actor_kind, sessionId: row.actor_session_id },
      changes: payload.changes ?? [],
      body: payload.body ?? null,
      relationKind: payload.relationKind ?? null,
      relatedIssue: related ? toIssueSummary(related, categories) : null,
      sessionId: payload.sessionId ?? null,
      createdAt: row.created_at,
    };
  });
}

function labelNames(
  ids: readonly string[],
  labels: ReadonlyMap<string, LabelRow>,
): string | null {
  const names = ids.map((id) => labels.get(id)?.name ?? id);
  return names.length > 0 ? names.join(", ") : null;
}

function parentIdentifier(
  database: DatabaseSync,
  parentId: string | null,
): string | null {
  if (!parentId) {
    return null;
  }
  const parent = getIssue(database, parentId);
  return parent ? formatIssueIdentifier(parent.number) : parentId;
}

export interface IssueSnapshot {
  row: IssueRow;
  labelIds: readonly string[];
}

export function diffIssue(
  database: DatabaseSync,
  before: IssueSnapshot,
  after: IssueSnapshot,
): IssueFieldChange[] {
  const changes: IssueFieldChange[] = [];
  const scalar = (
    field: IssueFieldChange["field"],
    from: string | null,
    to: string | null,
  ) => {
    if (from !== to) {
      changes.push({ field, from, to });
    }
  };
  scalar("title", before.row.title, after.row.title);
  if (before.row.description_markdown !== after.row.description_markdown) {
    changes.push({ field: "description", from: null, to: null });
  }
  scalar("status", before.row.status, after.row.status);
  scalar("priority", before.row.priority, after.row.priority);
  scalar("workspace", before.row.workspace_id, after.row.workspace_id);
  scalar(
    "parent",
    parentIdentifier(database, before.row.parent_id),
    parentIdentifier(database, after.row.parent_id),
  );
  const beforeLabels = [...before.labelIds].sort().join("\n");
  const afterLabels = [...after.labelIds].sort().join("\n");
  if (beforeLabels !== afterLabels) {
    const labels = new Map(
      (
        database
          .prepare("SELECT id, name, color FROM issue_labels")
          .all() as LabelRow[]
      ).map((label) => [label.id, label]),
    );
    changes.push({
      field: "labels",
      from: labelNames(before.labelIds, labels),
      to: labelNames(after.labelIds, labels),
    });
  }
  return changes;
}
