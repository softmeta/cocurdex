import {
  defaultStatusCategory,
  formatIssueIdentifier,
  type IssueDetail,
  type IssueRecord,
  type ViewColumnRecord,
} from "@cocurdex/shared";
import type { DesktopApi } from "./types";

type IssueFallbackApi = Pick<
  DesktopApi,
  | "issueListViews"
  | "issueLoad"
  | "issueGet"
  | "issueCreateView"
  | "issueDeleteView"
  | "issueUpdateView"
  | "issueCreateColumn"
  | "issueUpdateColumn"
  | "issueMoveColumn"
  | "issueDeleteColumn"
  | "issueCreate"
  | "issueUpdate"
  | "issueMove"
  | "issueDelete"
  | "issueGetDetail"
  | "issueCreateLabel"
  | "issueUpdateLabel"
  | "issueDeleteLabel"
  | "issueAddRelation"
  | "issueRemoveRelation"
  | "issueComment"
>;

function fallbackIssue(
  fields: Partial<IssueRecord> & Pick<IssueRecord, "id" | "viewId">,
): IssueRecord {
  const now = new Date().toISOString();
  const status = fields.status ?? "backlog";
  return {
    number: 1,
    identifier: formatIssueIdentifier(1),
    columnId: status,
    title: "",
    description: null,
    color: null,
    status,
    statusCategory: defaultStatusCategory(status),
    priority: "none",
    workspaceId: null,
    parentId: null,
    labelIds: [],
    completedAt: null,
    sortOrder: 0,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

function fallbackColumn(
  fields: Partial<ViewColumnRecord> & Pick<ViewColumnRecord, "id" | "field">,
): ViewColumnRecord {
  const now = new Date().toISOString();
  return {
    title: "",
    color: null,
    category: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

function fallbackDetail(id: string): IssueDetail {
  return {
    issue: fallbackIssue({ id, viewId: "project" }),
    parent: null,
    children: [],
    relations: [],
    sessions: [],
    events: [],
  };
}

export const issueFallbackApi: IssueFallbackApi = {
  issueListViews: async () => [],
  issueLoad: async () => null,
  issueGet: async () => null,
  issueCreateView: async (payload) => ({
    id: "view",
    title: payload.title ?? "New view",
    icon: payload.icon ?? null,
    groupBy: "status" as const,
    layout: "board" as const,
    filters: [],
    revision: 1,
  }),
  issueDeleteView: async () => {},
  issueUpdateView: async (payload) => {
    const now = new Date().toISOString();
    return {
      view: {
        id: payload.viewId,
        title: payload.title ?? "Project view",
        icon: payload.icon ?? null,
        groupBy: payload.groupBy ?? "status",
        layout: payload.layout ?? "board",
        filters: payload.filters ?? [],
        revision: (payload.expectedRevision ?? 0) + 1,
        createdAt: now,
        updatedAt: now,
      },
      columns: [],
      statusOptions: [],
      priorityOptions: [],
      labels: [],
      issues: [],
    };
  },
  issueCreateColumn: async (payload) =>
    fallbackColumn({
      id: "column",
      field: payload.field,
      title: payload.title ?? "",
      color: payload.color ?? null,
      category: payload.category ?? null,
      sortOrder: payload.sortOrder ?? 0,
    }),
  issueUpdateColumn: async (payload) =>
    fallbackColumn({
      id: payload.id,
      field: payload.field,
      title: payload.title ?? "",
      color: payload.color ?? null,
      category: payload.category ?? null,
    }),
  issueMoveColumn: async (payload) =>
    fallbackColumn({
      id: payload.id,
      field: payload.field,
      sortOrder: payload.sortOrder,
    }),
  issueDeleteColumn: async () => {},
  issueCreate: async (payload) =>
    fallbackIssue({
      id: "001",
      viewId: payload.viewId,
      columnId: payload.columnId ?? payload.status ?? "backlog",
      title: payload.title ?? "",
      description: payload.description ?? null,
      color: payload.color ?? null,
      status: payload.status ?? payload.columnId ?? "backlog",
      priority: payload.priority ?? "none",
      workspaceId: payload.workspaceId ?? null,
      parentId: payload.parentId ?? null,
      labelIds: payload.labelIds ?? [],
      sortOrder: payload.sortOrder ?? 0,
    }),
  issueUpdate: async (payload) =>
    fallbackIssue({
      id: payload.id,
      viewId: payload.viewId,
      title: payload.title ?? "",
      description: payload.description ?? null,
      color: payload.color ?? null,
      status: payload.status ?? "backlog",
      priority: payload.priority ?? "none",
      workspaceId: payload.workspaceId ?? null,
      parentId: payload.parentId ?? null,
      labelIds: payload.labelIds ?? [],
      revision: (payload.expectedRevision ?? 0) + 1,
    }),
  issueMove: async (payload) =>
    fallbackIssue({
      id: payload.id,
      viewId: payload.viewId,
      columnId: payload.columnId,
      status: payload.columnId,
      sortOrder: payload.sortOrder,
      revision: (payload.expectedRevision ?? 0) + 1,
    }),
  issueDelete: async () => {},
  issueGetDetail: async () => null,
  issueCreateLabel: async (payload) => ({
    id: "label",
    name: payload.name,
    color: payload.color ?? null,
  }),
  issueUpdateLabel: async (payload) => ({
    id: payload.id,
    name: payload.name ?? "",
    color: payload.color ?? null,
  }),
  issueDeleteLabel: async () => {},
  issueAddRelation: async (payload) => fallbackDetail(payload.id),
  issueRemoveRelation: async (payload) => fallbackDetail(payload.id),
  issueComment: async (payload) => fallbackDetail(payload.id),
};
