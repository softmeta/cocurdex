import type {
  CreateColumnPayload,
  CreateIssuePayload,
  CreateViewPayload,
  DeleteColumnPayload,
  DeleteIssuePayload,
  DeleteViewPayload,
  GetIssuePayload,
  IssueRecord,
  LoadViewPayload,
  MoveColumnPayload,
  MoveIssuePayload,
  UpdateColumnPayload,
  UpdateIssuePayload,
  UpdateViewPayload,
  ViewColumnRecord,
  ViewFull,
  ViewSummary,
} from "@cocurdex/shared";

export interface IssueTrackerRepository {
  listViews(): Promise<ViewSummary[]>;
  loadView(payload: LoadViewPayload): Promise<ViewFull | null>;
  createView(payload: CreateViewPayload): Promise<ViewSummary>;
  updateView(payload: UpdateViewPayload): Promise<ViewFull>;
  deleteView(payload: DeleteViewPayload): Promise<void>;
  createColumn(payload: CreateColumnPayload): Promise<ViewColumnRecord>;
  updateColumn(payload: UpdateColumnPayload): Promise<ViewColumnRecord>;
  moveColumn(payload: MoveColumnPayload): Promise<ViewColumnRecord>;
  deleteColumn(payload: DeleteColumnPayload): Promise<void>;
  getIssue(payload: GetIssuePayload): Promise<IssueRecord>;
  createIssue(payload: CreateIssuePayload): Promise<IssueRecord>;
  updateIssue(payload: UpdateIssuePayload): Promise<IssueRecord>;
  moveIssue(payload: MoveIssuePayload): Promise<IssueRecord>;
  deleteIssue(payload: DeleteIssuePayload): Promise<void>;
}

export class IssueNotFoundError extends Error {
  readonly code = "ISSUE_NOT_FOUND";

  constructor(id: string) {
    super(`Issue not found: ${id}`);
    this.name = "IssueNotFoundError";
  }
}

export class IssueConflictError extends Error {
  readonly code = "ISSUE_REVISION_CONFLICT";

  constructor() {
    super("Issue was modified");
    this.name = "IssueConflictError";
  }
}

export class IssueViewNotFoundError extends Error {
  readonly code = "ISSUE_VIEW_NOT_FOUND";

  constructor(id: string) {
    super(`Issue view not found: ${id}`);
    this.name = "IssueViewNotFoundError";
  }
}

export class IssueViewConflictError extends Error {
  readonly code = "ISSUE_VIEW_REVISION_CONFLICT";

  constructor() {
    super("Issue view was modified");
    this.name = "IssueViewConflictError";
  }
}
