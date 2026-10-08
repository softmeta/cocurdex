import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_VIEW_ID,
  ISSUE_RELATION_KINDS,
  type IssueDetail,
  type IssueRelationKind,
  type IssueRelationPayload,
} from "@cocurdex/shared";
import { listIssueEvents, recordIssueEvent } from "./issue-events";
import {
  deleteRelation,
  insertLabel,
  insertRelation,
  insertSessionLink,
  listChildIssues,
  listRelations,
  listSessionLinks,
  requireLabel,
} from "./issue-links";
import { withIssueMutation } from "./issue-mutation-helpers";
import {
  getIssue,
  type IssueRow,
  listLabels,
  projectSingleIssue,
  requireIssue,
  requireView,
  statusCategories,
  toIssueSummary,
  type ViewRow,
} from "./issue-storage";
import type { IssueTrackerRepository } from "./issue-tracker-repository";

type IssueCollaborationOperations = Pick<
  IssueTrackerRepository,
  | "getIssueDetail"
  | "listLabels"
  | "createLabel"
  | "updateLabel"
  | "deleteLabel"
  | "addRelation"
  | "removeRelation"
  | "comment"
  | "linkSession"
>;

function assertRelationKind(kind: string): asserts kind is IssueRelationKind {
  if (!ISSUE_RELATION_KINDS.includes(kind as IssueRelationKind)) {
    throw new Error(
      `Unknown issue relation kind: ${kind} (valid: ${ISSUE_RELATION_KINDS.join(", ")})`,
    );
  }
}

function buildDetail(
  database: DatabaseSync,
  issue: IssueRow,
  view: ViewRow,
): IssueDetail {
  const categories = statusCategories(database);
  const parent = issue.parent_id ? getIssue(database, issue.parent_id) : null;
  return {
    issue: projectSingleIssue(database, issue, view),
    parent: parent ? toIssueSummary(parent, categories) : null,
    children: listChildIssues(database, issue.id, categories),
    relations: listRelations(database, issue.id, categories),
    sessions: listSessionLinks(database, issue.id),
    events: listIssueEvents(database, issue.id, categories),
  };
}

function defaultDetail(database: DatabaseSync, issueId: string) {
  return buildDetail(
    database,
    requireIssue(database, issueId),
    requireView(database, DEFAULT_VIEW_ID),
  );
}

function changeRelation(
  database: DatabaseSync,
  payload: IssueRelationPayload,
  kind: "relation_added" | "relation_removed",
): IssueDetail {
  assertRelationKind(payload.kind);
  const relationKind = payload.kind;
  return withIssueMutation(database, () => {
    const issue = requireIssue(database, payload.id);
    const related = requireIssue(database, payload.relatedId);
    const change = kind === "relation_added" ? insertRelation : deleteRelation;
    if (change(database, issue.id, relationKind, related.id)) {
      const now = new Date().toISOString();
      for (const [owner, other] of [
        [issue.id, related.id],
        [related.id, issue.id],
      ] as const) {
        recordIssueEvent(database, {
          issueId: owner,
          kind,
          actor: payload.actor,
          relationKind,
          relatedIssueId: other,
          createdAt: now,
        });
      }
    }
    return defaultDetail(database, issue.id);
  });
}

export function createIssueCollaborationOperations(
  database: DatabaseSync,
): IssueCollaborationOperations {
  return {
    async getIssueDetail(payload) {
      const view = requireView(database, payload.viewId ?? DEFAULT_VIEW_ID);
      const issue = getIssue(database, payload.id);
      return issue ? buildDetail(database, issue, view) : null;
    },
    async listLabels() {
      return listLabels(database);
    },
    async createLabel(payload) {
      return insertLabel(database, payload.name, payload.color ?? null);
    },
    async updateLabel(payload) {
      const current = requireLabel(database, payload.id);
      const name = payload.name?.trim() || current.name;
      const duplicate = database
        .prepare(
          "SELECT 1 FROM issue_labels WHERE name = ? COLLATE NOCASE AND id != ?",
        )
        .get(name, current.id);
      if (duplicate) {
        throw new Error(`Issue label already exists: ${name}`);
      }
      const color = payload.color !== undefined ? payload.color : current.color;
      database
        .prepare(
          "UPDATE issue_labels SET name = ?, color = ?, updated_at = ? WHERE id = ?",
        )
        .run(name, color, new Date().toISOString(), current.id);
      return { id: current.id, name, color };
    },
    async deleteLabel(payload) {
      const current = requireLabel(database, payload.id);
      database.prepare("DELETE FROM issue_labels WHERE id = ?").run(current.id);
    },
    async addRelation(payload) {
      return changeRelation(database, payload, "relation_added");
    },
    async removeRelation(payload) {
      return changeRelation(database, payload, "relation_removed");
    },
    async comment(payload) {
      const body = payload.body.trim();
      if (!body) {
        throw new Error("Issue comment body is required");
      }
      const issue = requireIssue(database, payload.id);
      recordIssueEvent(database, {
        issueId: issue.id,
        kind: "commented",
        actor: payload.actor,
        body,
      });
      return defaultDetail(database, issue.id);
    },
    async linkSession(payload) {
      return withIssueMutation(database, () => {
        const issue = requireIssue(database, payload.id);
        const linked = insertSessionLink(database, issue.id, payload.sessionId);
        if (linked) {
          recordIssueEvent(database, {
            issueId: issue.id,
            kind: "session_linked",
            actor: { kind: "session", sessionId: payload.sessionId },
            sessionId: payload.sessionId,
          });
        }
        return linked;
      });
    },
  };
}
