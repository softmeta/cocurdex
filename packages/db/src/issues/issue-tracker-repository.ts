import type {
  CommentIssuePayload,
  CreateColumnPayload,
  CreateIssueLabelPayload,
  CreateIssuePayload,
  CreateViewPayload,
  DeleteColumnPayload,
  DeleteIssueLabelPayload,
  DeleteIssuePayload,
  DeleteViewPayload,
  GetIssueDetailPayload,
  GetIssuePayload,
  IssueDetail,
  IssueLabel,
  IssueRecord,
  IssueRelationPayload,
  LinkIssueSessionPayload,
  LoadViewPayload,
  MoveColumnPayload,
  MoveIssuePayload,
  UpdateColumnPayload,
  UpdateIssueLabelPayload,
  UpdateIssuePayload,
  UpdateViewPayload,
  ViewColumnRecord,
  ViewFull,
  ViewSummary,
} from "@cocurdex/shared";
import { ISSUE_CONFLICT_MESSAGE } from "@cocurdex/shared";

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
  getIssue(payload: GetIssuePayload): Promise<IssueRecord | null>;
  createIssue(payload: CreateIssuePayload): Promise<IssueRecord>;
  updateIssue(payload: UpdateIssuePayload): Promise<IssueRecord>;
  moveIssue(payload: MoveIssuePayload): Promise<IssueRecord>;
  deleteIssue(payload: DeleteIssuePayload): Promise<void>;
  getIssueDetail(payload: GetIssueDetailPayload): Promise<IssueDetail | null>;
  listLabels(): Promise<IssueLabel[]>;
  createLabel(payload: CreateIssueLabelPayload): Promise<IssueLabel>;
  updateLabel(payload: UpdateIssueLabelPayload): Promise<IssueLabel>;
  deleteLabel(payload: DeleteIssueLabelPayload): Promise<void>;
  addRelation(payload: IssueRelationPayload): Promise<IssueDetail>;
  removeRelation(payload: IssueRelationPayload): Promise<IssueDetail>;
  comment(payload: CommentIssuePayload): Promise<IssueDetail>;
  linkSession(payload: LinkIssueSessionPayload): Promise<boolean>;
  listLinkedSessionIds(): Promise<string[]>;
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
    super(ISSUE_CONFLICT_MESSAGE);
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
