export type GitRefKind = "local" | "remote" | "detached";

export interface GitBranchInfo {
  name: string;
  current: boolean;
  kind: GitRefKind;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  committedAt: string;
}

export type GitDiffScopeMode =
  | "working"
  | "unstaged"
  | "staged"
  | "commit"
  | "branch";

export type WorkspaceGitDiffQuery =
  | { mode: "working" }
  | { mode: "unstaged" }
  | { mode: "staged" }
  | { mode: "commit"; commit: string }
  | { mode: "branch"; source: string; target: string };

export type GitFileStagedState = "staged" | "unstaged" | "partial";

export type GitChangeKind = "added" | "modified" | "deleted";

export type GitContentsOmittedReason = "binary" | "too-large" | "unavailable";

export interface WorkspaceGitFileChange {
  path: string;
  changeType: GitChangeKind;
  oldContents: string;
  newContents: string;
  omittedReason: GitContentsOmittedReason | null;
  stagedState: GitFileStagedState;
}

export type WorkspaceGitDiffStatus = "ok" | "not-a-repo" | "error";

export interface WorkspaceGitDiffResult {
  status: WorkspaceGitDiffStatus;
  changes: WorkspaceGitFileChange[];
}

export type WorkspaceGitTreeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "ignored";

export interface WorkspaceGitStatusEntry {
  path: string;
  status: WorkspaceGitTreeStatus;
}

export interface WorkspaceGitStatusResult {
  status: WorkspaceGitDiffStatus;
  entries: WorkspaceGitStatusEntry[];
}

export interface GitCommitResult {
  commitHash: string;
  message: string;
  generatedMessage: boolean;
}

export interface GitPushResult {
  branch: string;
  remote: string;
}
