export type InboxItemKind =
  | "approval"
  | "question"
  | "plan"
  | "failed"
  | "completed"
  | "routine-failed"
  | "routine-paused"
  | "routine-result";

export type InboxForm = "work" | "chat" | "personal";

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  form: InboxForm;
  sessionId: string | null;
  workspaceId: string | null;
  routineId: string | null;
  runId: string | null;
  title: string;
  detail: string | null;
  at: string;
}

export const INBOX_NEEDS_YOU_KINDS: readonly InboxItemKind[] = [
  "approval",
  "question",
  "plan",
];

export const INBOX_FAILURE_KINDS: readonly InboxItemKind[] = [
  "failed",
  "routine-failed",
  "routine-paused",
];
