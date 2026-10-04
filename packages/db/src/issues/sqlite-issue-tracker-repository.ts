import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_VIEW_ID, type ViewGroupBy } from "@cocurdex/shared";
import {
  type ColumnRow,
  fallbackColumnId,
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
  field: ViewGroupBy,
  columnId: string,
): ColumnRow {
  const columns = listColumns(database, field);
  const column = columns.find((candidate) => candidate.id === columnId);
  if (!column) {
    const validIds = columns.map((candidate) => candidate.id).join(", ");
    throw new Error(
      `Issue ${field} column not found: ${columnId} (valid: ${validIds})`,
    );
  }
  return column;
}

function assertFieldValue(
  database: DatabaseSync,
  field: ViewGroupBy,
  value: string | undefined,
): void {
  if (value !== undefined) {
    requireColumn(database, field, value);
  }
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

function withIssueMutation<T>(database: DatabaseSync, mutation: () => T): T {
  database.exec("SAVEPOINT issue_mutation");
  try {
    const result = mutation();
    database.exec("RELEASE SAVEPOINT issue_mutation");
    return result;
  } catch (error) {
    database.exec("ROLLBACK TO SAVEPOINT issue_mutation");
    database.exec("RELEASE SAVEPOINT issue_mutation");
    throw error;
  }
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
      const { field } = payload;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const maxOrder = Math.max(
        -1000,
        ...listColumns(database, field).map((column) => column.sort_order),
      );
      database
        .prepare(
          `INSERT INTO issue_columns (
             field, id, title, color, sort_order, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          field,
          id,
          payload.title?.trim() || "Column",
          payload.color ?? null,
          payload.sortOrder ?? maxOrder + 1000,
          now,
          now,
        );
      return mapColumn(requireColumn(database, field, id));
    },
    async updateColumn(payload) {
      const current = requireColumn(database, payload.field, payload.id);
      database
        .prepare(
          `UPDATE issue_columns
           SET title = ?, color = ?, updated_at = ?
           WHERE field = ? AND id = ?`,
        )
        .run(
          payload.title?.trim() || current.title,
          payload.color !== undefined ? payload.color : current.color,
          new Date().toISOString(),
          current.field,
          current.id,
        );
      return mapColumn(requireColumn(database, current.field, current.id));
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
        database
          .prepare(
            `UPDATE issues
             SET ${field} = ?, revision = revision + 1, updated_at = ?
             WHERE ${field} = ?`,
          )
          .run(
            fallbackColumnId(remaining, field),
            new Date().toISOString(),
            payload.id,
          );
        database
          .prepare("DELETE FROM issue_columns WHERE field = ? AND id = ?")
          .run(field, payload.id);
      });
    },
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
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
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
      database
        .prepare(
          `INSERT INTO issues (
             id, title, description_markdown, color, status, priority,
             workspace_id, assignee_session_id, sort_order, revision,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          id,
          payload.title?.trim() || "Untitled",
          payload.description ?? "",
          payload.color ?? null,
          status,
          priority,
          payload.workspaceId ?? null,
          payload.assigneeSessionId ?? null,
          payload.sortOrder ?? maxIssueOrder(database, view.group_by, columnId),
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
      assertFieldValue(database, "status", payload.status);
      assertFieldValue(database, "priority", payload.priority);
      const result = database
        .prepare(
          `UPDATE issues
           SET title = ?, description_markdown = ?, color = ?, status = ?,
               priority = ?, workspace_id = ?, assignee_session_id = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          payload.title?.trim() || current.title,
          payload.description !== undefined
            ? (payload.description ?? "")
            : current.description_markdown,
          payload.color !== undefined ? payload.color : current.color,
          payload.status ?? current.status,
          payload.priority ?? current.priority,
          payload.workspaceId !== undefined
            ? payload.workspaceId
            : current.workspace_id,
          payload.assigneeSessionId !== undefined
            ? payload.assigneeSessionId
            : current.assignee_session_id,
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
      requireColumn(database, view.group_by, payload.columnId);
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
