import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_VIEW_ID,
  ISSUE_STATUS_CATEGORIES,
  type IssueStatusCategory,
  isClosedStatusCategory,
} from "@cocurdex/shared";
import {
  assertRevision,
  requireColumn,
  withIssueMutation,
} from "./issue-mutation-helpers";
import {
  fallbackColumnId,
  getView,
  insertView,
  listColumns,
  mapColumn,
  mapViewSummary,
  projectView,
  requireView,
} from "./issue-storage";
import {
  type IssueTrackerRepository,
  IssueViewConflictError,
} from "./issue-tracker-repository";

type IssueViewOperations = Pick<
  IssueTrackerRepository,
  | "listViews"
  | "loadView"
  | "createView"
  | "updateView"
  | "deleteView"
  | "createColumn"
  | "updateColumn"
  | "moveColumn"
  | "deleteColumn"
>;

function assertCategory(category: string | undefined): void {
  if (
    category !== undefined &&
    !ISSUE_STATUS_CATEGORIES.includes(category as IssueStatusCategory)
  ) {
    throw new Error(
      `Unknown issue status category: ${category} (valid: ${ISSUE_STATUS_CATEGORIES.join(", ")})`,
    );
  }
}

function syncCompletedAt(
  database: DatabaseSync,
  statusId: string,
  category: IssueStatusCategory | null,
  now: string,
): void {
  if (isClosedStatusCategory(category)) {
    database
      .prepare(
        `UPDATE issues SET completed_at = COALESCE(completed_at, ?)
         WHERE status = ?`,
      )
      .run(now, statusId);
    return;
  }
  database
    .prepare("UPDATE issues SET completed_at = NULL WHERE status = ?")
    .run(statusId);
}

export function createIssueViewOperations(
  database: DatabaseSync,
): IssueViewOperations {
  return {
    async listViews() {
      const rows = database
        .prepare("SELECT * FROM issue_views ORDER BY title, id")
        .all() as Parameters<typeof mapViewSummary>[0][];
      return rows.map(mapViewSummary);
    },
    async loadView(payload) {
      const view = getView(database, payload.viewId ?? DEFAULT_VIEW_ID);
      return view ? projectView(database, view) : null;
    },
    async createView(payload) {
      return mapViewSummary(
        insertView(
          database,
          payload.title?.trim() || "New view",
          payload.icon ?? null,
        ),
      );
    },
    async updateView(payload) {
      const current = requireView(database, payload.viewId);
      assertRevision(
        current,
        payload.expectedRevision,
        new IssueViewConflictError(),
      );
      const result = database
        .prepare(
          `UPDATE issue_views
           SET title = ?, icon = ?, group_by = ?, layout = ?,
               filters_json = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          payload.title ?? current.title,
          payload.icon !== undefined ? payload.icon : current.icon,
          payload.groupBy ?? current.group_by,
          payload.layout ?? current.layout,
          payload.filters !== undefined
            ? JSON.stringify(payload.filters)
            : current.filters_json,
          new Date().toISOString(),
          current.id,
          current.revision,
        );
      if (result.changes !== 1) {
        throw new IssueViewConflictError();
      }
      return projectView(database, requireView(database, current.id));
    },
    async deleteView(payload) {
      const current = requireView(database, payload.viewId);
      assertRevision(
        current,
        payload.expectedRevision,
        new IssueViewConflictError(),
      );
      if (current.id === DEFAULT_VIEW_ID) {
        database
          .prepare(
            `UPDATE issue_views
             SET title = 'Project view', icon = NULL, group_by = 'status',
                 layout = 'board', filters_json = '[]',
                 revision = revision + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(new Date().toISOString(), current.id);
        return;
      }
      database.prepare("DELETE FROM issue_views WHERE id = ?").run(current.id);
    },
    async createColumn(payload) {
      const { field } = payload;
      assertCategory(payload.category);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const maxOrder = Math.max(
        -1000,
        ...listColumns(database, field).map((column) => column.sort_order),
      );
      database
        .prepare(
          `INSERT INTO issue_columns (
             field, id, title, color, category, sort_order, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          field,
          id,
          payload.title?.trim() || "Column",
          payload.color ?? null,
          field === "status" ? (payload.category ?? "unstarted") : null,
          payload.sortOrder ?? maxOrder + 1000,
          now,
          now,
        );
      return mapColumn(requireColumn(database, field, id));
    },
    async updateColumn(payload) {
      assertCategory(payload.category);
      return withIssueMutation(database, () => {
        const current = requireColumn(database, payload.field, payload.id);
        const now = new Date().toISOString();
        const category =
          current.field === "status"
            ? (payload.category ?? current.category)
            : null;
        database
          .prepare(
            `UPDATE issue_columns
             SET title = ?, color = ?, category = ?, updated_at = ?
             WHERE field = ? AND id = ?`,
          )
          .run(
            payload.title?.trim() || current.title,
            payload.color !== undefined ? payload.color : current.color,
            category,
            now,
            current.field,
            current.id,
          );
        if (category !== current.category) {
          syncCompletedAt(database, current.id, category, now);
        }
        return mapColumn(requireColumn(database, current.field, current.id));
      });
    },
    async moveColumn(payload) {
      const current = requireColumn(database, payload.field, payload.id);
      database
        .prepare(
          `UPDATE issue_columns
           SET sort_order = ?, updated_at = ?
           WHERE field = ? AND id = ?`,
        )
        .run(
          payload.sortOrder,
          new Date().toISOString(),
          current.field,
          current.id,
        );
      return mapColumn(requireColumn(database, current.field, current.id));
    },
    async deleteColumn(payload) {
      const { field } = payload;
      return withIssueMutation(database, () => {
        requireColumn(database, field, payload.id);
        const remaining = listColumns(database, field).filter(
          (column) => column.id !== payload.id,
        );
        if (remaining.length === 0) {
          throw new Error(`Cannot delete the last issue ${field} column`);
        }
        const fallbackId = fallbackColumnId(remaining, field);
        const now = new Date().toISOString();
        database
          .prepare(
            `UPDATE issues
             SET ${field} = ?, revision = revision + 1, updated_at = ?
             WHERE ${field} = ?`,
          )
          .run(fallbackId, now, payload.id);
        database
          .prepare("DELETE FROM issue_columns WHERE field = ? AND id = ?")
          .run(field, payload.id);
        if (field === "status") {
          const fallback = requireColumn(database, field, fallbackId);
          syncCompletedAt(database, fallbackId, fallback.category, now);
        }
      });
    },
  };
}
