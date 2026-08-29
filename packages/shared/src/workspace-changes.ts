export type WorkspaceChangeSource =
  | "claude-checkpoint"
  | "codex-turn-diff"
  | "opencode-session-diff"
  | "acp-tool-diff"
  | "pi-tool-patch"
  | "git-checkpoint"
  | "filesystem-checkpoint";

export type WorkspaceChangeCoverage =
  | "workspace"
  | "provider-file-tools"
  | "tool-call";

export type TurnFileOperation = "add" | "modify" | "delete" | "rename";

export type TurnFileReviewKind =
  | "text"
  | "document"
  | "spreadsheet"
  | "image"
  | "binary";

export type TurnChangeSetStatus =
  | "collecting"
  | "ready"
  | "partial"
  | "error"
  | "undone";

export type TurnChangeOutcome = "completed" | "interrupted" | "failed";

export type HostCheckpointKind = "git-checkpoint" | "filesystem-checkpoint";

export interface TurnFileChange {
  path: string;
  previousPath?: string | null;
  operation: TurnFileOperation;
  reviewKind: TurnFileReviewKind;
  additions?: number | null;
  deletions?: number | null;
  patch?: string | null;
  beforeHash?: string | null;
  afterHash?: string | null;
  beforeSize?: number | null;
  afterSize?: number | null;
  restorable?: boolean | null;
  restoreFailureReason?:
    | "too-large"
    | "quota"
    | "concurrent-modification"
    | null;
}

export interface TurnChangeSet {
  id: string;
  sessionId: string;
  messageId: string;
  userMessageId: string;
  providerTurnId?: string | null;
  source: WorkspaceChangeSource;
  coverage: WorkspaceChangeCoverage;
  files: TurnFileChange[];
  additions?: number | null;
  deletions?: number | null;
  nativeCheckpointRef?: string | null;
  hostBeforeCheckpointRef?: string | null;
  hostBeforeCheckpointKind?: HostCheckpointKind | null;
  hostAfterCheckpointRef?: string | null;
  hostAfterCheckpointKind?: HostCheckpointKind | null;
  hostRecoveryCheckpointRef?: string | null;
  hostRecoveryCheckpointKind?: HostCheckpointKind | null;
  outcome?: TurnChangeOutcome | null;
  nativeFiles?: TurnFileChange[] | null;
  undoable?: boolean | null;
  status: TurnChangeSetStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentWorkspaceChangeCapabilities {
  turnDiff: "full" | "tool-level" | "none";
  fileRewind: "native" | "none";
  coverage: WorkspaceChangeCoverage;
  conversationRevert: boolean;
}

export interface NativeWorkspaceChangeEvidence {
  source: WorkspaceChangeSource;
  coverage: WorkspaceChangeCoverage;
  files: TurnFileChange[];
  additions?: number | null;
  deletions?: number | null;
  providerTurnId?: string | null;
  nativeCheckpointRef?: string | null;
}

export interface NativeWorkspaceRewindInput {
  nativeCheckpointRef: string;
  dryRun?: boolean;
}

export interface NativeWorkspaceRewindResult {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
  skippedLinks?: number;
}

export interface AgentNativeWorkspaceEvidenceEvent {
  type: "workspace.native-evidence";
  sessionId: string;
  userMessageId?: string | null;
  evidence: NativeWorkspaceChangeEvidence;
}

export interface AgentTurnChangesUpdatedEvent {
  type: "workspace.changes.updated";
  sessionId: string;
  changeSet: TurnChangeSet;
}

export type UndoFileResultStatus =
  | "restored"
  | "conflict"
  | "failed"
  | "skipped";

export interface UndoFileResult {
  path: string;
  status: UndoFileResultStatus;
  reason?: string | null;
}

export interface UndoTurnChangesInput {
  sessionId: string;
  messageId: string;
}

export type UndoRecoveryStatus = "not-attempted" | "succeeded" | "failed";

export interface UndoTurnChangesResult {
  changeSetId: string;
  status: "restored" | "conflict" | "failed";
  files: UndoFileResult[];
  recoveryCheckpointRef?: string | null;
  recoveryStatus?: UndoRecoveryStatus | null;
}

export interface TurnChangeFileContentRequest {
  sessionId: string;
  messageId: string;
  path: string;
  side: "before" | "after";
}

export interface TurnChangeFileContent {
  path: string;
  side: "before" | "after";
  reviewKind: TurnFileReviewKind;
  exists: boolean;
  sizeBytes: number | null;
  hash: string | null;
  text: string | null;
  contentBase64: string | null;
  mimeType: string | null;
}
