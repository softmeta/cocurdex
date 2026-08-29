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
import { desktopApi } from "@/lib";

export const issuesIpc = {
  listViews: (): Promise<ViewSummary[]> => desktopApi.issueListViews(),
  load: (payload: LoadViewPayload): Promise<ViewFull | null> =>
    desktopApi.issueLoad(payload),
  getIssue: (payload: GetIssuePayload): Promise<IssueRecord> =>
    desktopApi.issueGet(payload),
  createView: (payload: CreateViewPayload): Promise<ViewSummary> =>
    desktopApi.issueCreateView(payload),
  deleteView: (payload: DeleteViewPayload): Promise<void> =>
    desktopApi.issueDeleteView(payload),
  updateView: (payload: UpdateViewPayload): Promise<ViewFull> =>
    desktopApi.issueUpdateView(payload),
  createColumn: (payload: CreateColumnPayload): Promise<ViewColumnRecord> =>
    desktopApi.issueCreateColumn(payload),
  updateColumn: (payload: UpdateColumnPayload): Promise<ViewColumnRecord> =>
    desktopApi.issueUpdateColumn(payload),
  moveColumn: (payload: MoveColumnPayload): Promise<ViewColumnRecord> =>
    desktopApi.issueMoveColumn(payload),
  deleteColumn: (payload: DeleteColumnPayload): Promise<void> =>
    desktopApi.issueDeleteColumn(payload),
  createIssue: (payload: CreateIssuePayload): Promise<IssueRecord> =>
    desktopApi.issueCreate(payload),
  updateIssue: (payload: UpdateIssuePayload): Promise<IssueRecord> =>
    desktopApi.issueUpdate(payload),
  moveIssue: (payload: MoveIssuePayload): Promise<IssueRecord> =>
    desktopApi.issueMove(payload),
  deleteIssue: (payload: DeleteIssuePayload): Promise<void> =>
    desktopApi.issueDelete(payload),
};
