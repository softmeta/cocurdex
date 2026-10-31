import type { IssueLabel, IssueRecord } from "@cocurdex/shared";
import type { IssueRelationChange } from "../issue-detail-store";

export interface IssueFieldValues {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  workspaceId: string | null;
  parentId: string | null;
  labelIds: string[];
}

export type IssueSaveRequest =
  | { kind: "create"; columnId: string; values: IssueFieldValues }
  | {
      kind: "update";
      id: string;
      expectedRevision: number;
      changes: Partial<IssueFieldValues>;
    };

export interface IssueComposeDraft {
  columnId: string;
  status: string;
  priority: string;
  workspaceId: string | null;
  parentId: string | null;
}

export interface IssueDetailActions {
  onCreateLabel: (name: string) => Promise<IssueLabel | null>;
  onOpenIssue: (issueId: string) => void;
  onAddSubIssue: (parent: IssueRecord) => void;
  onAddRelation: (change: IssueRelationChange) => void;
  onRemoveRelation: (change: IssueRelationChange) => void;
  onComment: (body: string) => Promise<boolean>;
}
