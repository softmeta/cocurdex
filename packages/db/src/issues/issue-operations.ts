import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_VIEW_ID,
  type IssueStatusCategory,
  isClosedStatusCategory,
} from "@cocurdex/shared";
import { diffIssue, recordIssueEvent } from "./issue-events";
import {
  assertValidParent,
  replaceIssueLabels,
  resolveLabelIds,
} from "./issue-links";
import {
  assertFieldValue,
  assertRevision,
  requireColumn,
  withIssueMutation,
} from "./issue-mutation-helpers";
import {
  fallbackColumnId,
  getIssue,
  LOCAL_ISSUE_SPACE_ID,
  listColumns,
  listIssueLabelIds,
  projectSingleIssue,
  requireIssue,
  requireView,
  statusCategories,
} from "./issue-storage";
import {
  IssueConflictError,
  type IssueTrackerRepository,
} from "./issue-tracker-repository";

type IssueOperations = Pick<
  IssueTrackerRepository,
  "getIssue" | "createIssue" | "updateIssue" | "moveIssue" | "deleteIssue"
>;

function maxIssueOrder(
  database: DatabaseSync,
  field: "status" | "priority",
  columnId: string,
): number {
  const row = database
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1000) + 1000 AS sort_order
       FROM issues
       WHERE ${field} = ?`,
    )
    .get(columnId) as { sort_order?: number } | undefined;
  return row?.sort_order ?? 0;
}

function nextIssueNumber(database: DatabaseSync): number {
  const row = database
    .prepare(
      "SELECT COALESCE(MAX(number), 0) + 1 AS number FROM issues WHERE space_id = ?",
    )
    .get(LOCAL_ISSUE_SPACE_ID) as { number: number };
  return row.number;
}

function completedAtFor(
  categories: Map<string, IssueStatusCategory | null>,
  status: string,
  previous: string | null,
  now: string,
): string | null {
  return isClosedStatusCategory(categories.get(status) ?? null)
    ? (previous ?? now)
    : null;
}

function labelIdsOf(database: DatabaseSync, issueId: string): string[] {
  return listIssueLabelIds(database, issueId).get(issueId) ?? [];
}

function resolveParentId(
  database: DatabaseSync,
  issueId: string | null,
  parentRef: string | null | undefined,
  current: string | null,
): string | null {
  if (parentRef === undefined) {
    return current;
  }
  if (parentRef === null || parentRef === "") {
    return null;
  }
  const parent = requireIssue(database, parentRef);
  assertValidParent(database, issueId, parent);
  return parent.id;
}

export function createIssueOperations(database: DatabaseSync): IssueOperations {
  return {
    async getIssue(payload) {
      const view = requireView(database, payload.viewId ?? DEFAULT_VIEW_ID);
      const issue = getIssue(database, payload.id);
      return issue ? projectSingleIssue(database, issue, view) : null;
    },
    async createIssue(payload) {
      const view = requireView(database, payload.viewId);
      assertFieldValue(database, "status", payload.status);
      assertFieldValue(database, "priority", payload.priority);
      const groupValue =
        view.group_by === "status" ? payload.status : payload.priority;
      const columnId =
        payload.columnId ??
        groupValue ??
        fallbackColumnId(listColumns(database, view.group_by), view.group_by);
      requireColumn(database, view.group_by, columnId);
      const status =
        payload.status ??
        (view.group_by === "status"
          ? columnId
          : fallbackColumnId(listColumns(database, "status"), "status"));
      const priority =
        payload.priority ??
        (view.group_by === "priority"
          ? columnId
          : fallbackColumnId(listColumns(database, "priority"), "priority"));
      return withIssueMutation(database, () => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const parentId = resolveParentId(
          database,
          null,
          payload.parentId,
          null,
        );
        const labelIds = resolveLabelIds(database, payload.labelIds ?? []);
        database
          .prepare(
            `INSERT INTO issues (
               id, title, description_markdown, color, status, priority,
               workspace_id, sort_order, revision, created_at, updated_at,
               space_id, number, parent_id, completed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            payload.title?.trim() || "Untitled",
            payload.description ?? "",
            payload.color ?? null,
            status,
            priority,
            payload.workspaceId ?? null,
            payload.sortOrder ??
              maxIssueOrder(database, view.group_by, columnId),
            now,
            now,
            LOCAL_ISSUE_SPACE_ID,
            nextIssueNumber(database),
            parentId,
            completedAtFor(statusCategories(database), status, null, now),
          );
        replaceIssueLabels(database, id, labelIds);
        recordIssueEvent(database, {
          issueId: id,
          kind: "created",
          actor: payload.actor,
          createdAt: now,
        });
        return projectSingleIssue(database, requireIssue(database, id), view);
      });
    },
    async updateIssue(payload) {
      const view = requireView(database, payload.viewId);
      assertFieldValue(database, "status", payload.status);
      assertFieldValue(database, "priority", payload.priority);
      return withIssueMutation(database, () => {
        const current = requireIssue(database, payload.id);
        assertRevision(
          current,
          payload.expectedRevision,
          new IssueConflictError(),
        );
        const now = new Date().toISOString();
        const status = payload.status ?? current.status;
        const parentId = resolveParentId(
          database,
          current.id,
          payload.parentId,
          current.parent_id,
        );
        const beforeLabels = labelIdsOf(database, current.id);
        const result = database
          .prepare(
            `UPDATE issues
             SET title = ?, description_markdown = ?, color = ?, status = ?,
                 priority = ?, workspace_id = ?, parent_id = ?, completed_at = ?,
                 revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(
            payload.title?.trim() || current.title,
            payload.description !== undefined
              ? (payload.description ?? "")
              : current.description_markdown,
            payload.color !== undefined ? payload.color : current.color,
            status,
            payload.priority ?? current.priority,
            payload.workspaceId !== undefined
              ? payload.workspaceId
              : current.workspace_id,
            parentId,
            completedAtFor(
              statusCategories(database),
              status,
              current.completed_at,
              now,
            ),
            now,
            current.id,
            current.revision,
          );
        if (result.changes !== 1) {
          throw new IssueConflictError();
        }
        if (payload.labelIds !== undefined) {
          replaceIssueLabels(
            database,
            current.id,
            resolveLabelIds(database, payload.labelIds),
          );
        }
        const next = requireIssue(database, current.id);
        const changes = diffIssue(
          database,
          { row: current, labelIds: beforeLabels },
          { row: next, labelIds: labelIdsOf(database, current.id) },
        );
        if (changes.length > 0) {
          recordIssueEvent(database, {
            issueId: current.id,
            kind: "updated",
            actor: payload.actor,
            changes,
            createdAt: now,
          });
        }
        return projectSingleIssue(database, next, view);
      });
    },
    async moveIssue(payload) {
      const view = requireView(database, payload.viewId);
      requireColumn(database, view.group_by, payload.columnId);
      return withIssueMutation(database, () => {
        const current = requireIssue(database, payload.id);
        assertRevision(
          current,
          payload.expectedRevision,
          new IssueConflictError(),
        );
        const now = new Date().toISOString();
        const status =
          view.group_by === "status" ? payload.columnId : current.status;
        const priority =
          view.group_by === "priority" ? payload.columnId : current.priority;
        const result = database
          .prepare(
            `UPDATE issues
             SET status = ?, priority = ?, sort_order = ?, completed_at = ?,
                 revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(
            status,
            priority,
            payload.sortOrder,
            completedAtFor(
              statusCategories(database),
              status,
              current.completed_at,
              now,
            ),
            now,
            current.id,
            current.revision,
          );
        if (result.changes !== 1) {
          throw new IssueConflictError();
        }
        const next = requireIssue(database, current.id);
        const labelIds = labelIdsOf(database, current.id);
        const changes = diffIssue(
          database,
          { row: current, labelIds },
          { row: next, labelIds },
        );
        if (changes.length > 0) {
          recordIssueEvent(database, {
            issueId: current.id,
            kind: "updated",
            actor: payload.actor,
            changes,
            createdAt: now,
          });
        }
        return projectSingleIssue(database, next, view);
      });
    },
    async deleteIssue(payload) {
      const current = getIssue(database, payload.id);
      if (!current) {
        return;
      }
      assertRevision(
        current,
        payload.expectedRevision,
        new IssueConflictError(),
      );
      const result = database
        .prepare("DELETE FROM issues WHERE id = ? AND revision = ?")
        .run(current.id, current.revision);
      if (result.changes !== 1) {
        throw new IssueConflictError();
      }
    },
  };
}
