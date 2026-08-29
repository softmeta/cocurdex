import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_VIEW_ID, type ViewGroupBy } from "@cocurdex/shared";
import {
  getIssue,
  getView,
  insertDefaultView,
  insertView,
  listColumns,
  mapColumn,
  mapViewSummary,
  projectSingleIssue,
  projectView,
  requireIssue,
  requireView,
} from "./issue-storage";
import {
  IssueConflictError,
  type IssueTrackerRepository,
  IssueViewConflictError,
} from "./issue-tracker-repository";

function assertRevision(
  current: { revision: number },
  expectedRevision: number | undefined,
  conflict: Error,
): void {
  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw conflict;
  }
}

function requireColumn(
  database: DatabaseSync,
  viewId: string,
  field: ViewGroupBy,
  columnId: string,
) {
  const column = listColumns(database, viewId, field).find(
    (candidate) => candidate.id === columnId,
  );
  if (!column) {
    throw new Error(`Issue view column not found: ${columnId}`);
  }
  return column;
}

function maxIssueOrder(
  database: DatabaseSync,
  field: ViewGroupBy,
  columnId: string,
): number {
  const column = field === "status" ? "status" : "priority";
  const row = database
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1000) + 1000 AS sort_order
       FROM issues
       WHERE ${column} = ?`,
    )
    .get(columnId) as { sort_order?: number } | undefined;
  return row?.sort_order ?? 0;
}

function touchView(database: DatabaseSync, viewId: string): void {
  database
    .prepare(
      `UPDATE issue_views
       SET revision = revision + 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(new Date().toISOString(), viewId);
}

export function createSqliteIssueTrackerRepository(
  database: DatabaseSync,
): IssueTrackerRepository {
  insertDefaultView(database);

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
      const view = requireView(database, payload.viewId);
      const field = view.group_by;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const existing = listColumns(database, view.id, field);
      const maxOrder = Math.max(
        -1000,
        ...existing.map((column) => column.sort_order),
      );
      database
        .prepare(
          `INSERT INTO issue_view_columns (
             view_id, field, id, title, color, sort_order, created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          view.id,
          field,
          id,
          payload.title?.trim() || "Column",
          payload.color ?? null,
          payload.sortOrder ?? maxOrder + 1000,
          now,
          now,
        );
      touchView(database, view.id);
      return mapColumn(requireColumn(database, view.id, field, id));
    },
    async updateColumn(payload) {
      const view = requireView(database, payload.viewId);
      const field = view.group_by;
      const current = listColumns(database, view.id, field).find(
        (column) => column.id === payload.id,
      );
      if (!current) {
        throw new Error(`Issue view column not found: ${payload.id}`);
      }
      const now = new Date().toISOString();
      database
        .prepare(
          `UPDATE issue_view_columns
           SET title = ?, color = ?, updated_at = ?
           WHERE view_id = ? AND field = ? AND id = ?`,
        )
        .run(
          payload.title ?? current.title,
          payload.color !== undefined ? payload.color : current.color,
          now,
          view.id,
          field,
          current.id,
        );
      touchView(database, view.id);
      return mapColumn(requireColumn(database, view.id, field, current.id));
    },
    async moveColumn(payload) {
      const view = requireView(database, payload.viewId);
      const field = view.group_by;
      const now = new Date().toISOString();
      const result = database
        .prepare(
          `UPDATE issue_view_columns
           SET sort_order = ?, updated_at = ?
           WHERE view_id = ? AND field = ? AND id = ?`,
        )
        .run(payload.sortOrder, now, view.id, field, payload.id);
      if (result.changes !== 1) {
        throw new Error(`Issue view column not found: ${payload.id}`);
      }
      touchView(database, view.id);
      return mapColumn(requireColumn(database, view.id, field, payload.id));
    },
    async deleteColumn(payload) {
      const view = requireView(database, payload.viewId);
      database
        .prepare(
          `DELETE FROM issue_view_columns
           WHERE view_id = ? AND field = ? AND id = ?`,
        )
        .run(view.id, view.group_by, payload.id);
      touchView(database, view.id);
    },
    async getIssue(payload) {
      const view = requireView(database, payload.viewId ?? DEFAULT_VIEW_ID);
      return projectSingleIssue(
        database,
        requireIssue(database, payload.id),
        view,
      );
    },
    async createIssue(payload) {
      const view = requireView(database, payload.viewId);
      const columns = listColumns(database, view.id, view.group_by);
      if (!columns.some((column) => column.id === payload.columnId)) {
        throw new Error(`Issue view column not found: ${payload.columnId}`);
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const status =
        payload.status ??
        (view.group_by === "status" ? payload.columnId : "backlog");
      const priority =
        payload.priority ??
        (view.group_by === "priority" ? payload.columnId : "none");
      database
        .prepare(
          `INSERT INTO issues (
             id, title, description_markdown, color, status, priority,
             workspace_id, sort_order, revision, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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
            maxIssueOrder(database, view.group_by, payload.columnId),
          now,
          now,
        );
      return projectSingleIssue(database, requireIssue(database, id), view);
    },
    async updateIssue(payload) {
      const view = requireView(database, payload.viewId);
      const current = requireIssue(database, payload.id);
      assertRevision(
        current,
        payload.expectedRevision,
        new IssueConflictError(),
      );
      const result = database
        .prepare(
          `UPDATE issues
           SET title = ?, description_markdown = ?, color = ?, status = ?,
               priority = ?, workspace_id = ?, revision = revision + 1,
               updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          payload.title ?? current.title,
          payload.description !== undefined
            ? (payload.description ?? "")
            : current.description_markdown,
          payload.color !== undefined ? payload.color : current.color,
          payload.status ?? current.status,
          payload.priority ?? current.priority,
          payload.workspaceId !== undefined
            ? payload.workspaceId
            : current.workspace_id,
          new Date().toISOString(),
          current.id,
          current.revision,
        );
      if (result.changes !== 1) {
        throw new IssueConflictError();
      }
      return projectSingleIssue(
        database,
        requireIssue(database, current.id),
        view,
      );
    },
    async moveIssue(payload) {
      const view = requireView(database, payload.viewId);
      const current = requireIssue(database, payload.id);
      assertRevision(
        current,
        payload.expectedRevision,
        new IssueConflictError(),
      );
      const columns = listColumns(database, view.id, view.group_by);
      if (!columns.some((column) => column.id === payload.columnId)) {
        throw new Error(`Issue view column not found: ${payload.columnId}`);
      }
      const status =
        view.group_by === "status" ? payload.columnId : current.status;
      const priority =
        view.group_by === "priority" ? payload.columnId : current.priority;
      const result = database
        .prepare(
          `UPDATE issues
           SET status = ?, priority = ?, sort_order = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          status,
          priority,
          payload.sortOrder,
          new Date().toISOString(),
          current.id,
          current.revision,
        );
      if (result.changes !== 1) {
        throw new IssueConflictError();
      }
      return projectSingleIssue(
        database,
        requireIssue(database, current.id),
        view,
      );
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
