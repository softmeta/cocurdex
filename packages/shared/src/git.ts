// local: refs/heads; remote: origin/main style; detached: short HEAD hash.
export type GitRefKind = "local" | "remote" | "detached";

export interface GitBranchInfo {
  name: string;
  current: boolean;
  kind: GitRefKind;
}

// One commit for the git panel's "commit" scope picker.
export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  // ISO-8601 timestamp from git `%cI`.
  committedAt: string;
}

// Diff source mode for the git panel. "working" is the historical default
// (index + worktree vs HEAD, including untracked).
export type GitDiffScopeMode =
  | "working"
  | "unstaged"
  | "staged"
  | "commit"
  | "branch";

// Query payload for getWorkspaceGitDiff. Omitted query means `{ mode: "working" }`.
export type WorkspaceGitDiffQuery =
  | { mode: "working" }
  | { mode: "unstaged" }
  | { mode: "staged" }
  | { mode: "commit"; commit: string }
  // source (left) vs target (right): changes on source relative to target
  // (`git diff target...source`).
  | { mode: "branch"; source: string; target: string };

// Whether a changed file's modifications are in the index, the working tree, or
// split across both (staged a revision, then edited further).
export type GitFileStagedState = "staged" | "unstaged" | "partial";

// Kind of change relative to HEAD. Renames are disabled in the diff commands,
// so a rename always surfaces as a delete + add pair.
export type GitChangeKind = "added" | "modified" | "deleted";

// Why a change carries no textual contents: git flagged it binary, or the file
// exceeds the size cap for building an in-memory diff.
export type GitContentsOmittedReason = "binary" | "too-large";

// A single changed file relative to HEAD, carrying full old/new contents so the
// renderer can build a non-partial diff and expand unchanged context on demand.
export interface WorkspaceGitFileChange {
  // Path relative to the workspace root, used for display and collapse identity.
  path: string;
  changeType: GitChangeKind;
  // HEAD version of the file; empty string for newly added files.
  oldContents: string;
  // Working-tree version of the file; empty string for deleted files.
  newContents: string;
  // Non-null when contents were withheld; the renderer shows a placeholder row.
  omittedReason: GitContentsOmittedReason | null;
  // Index vs working-tree staging status, driving the row's stage checkbox.
  stagedState: GitFileStagedState;
}

// Outcome of a workspace diff request, so the renderer can distinguish "clean
// tree" from "not a git repository" and "git failed" instead of showing all
// three as an empty change list.
export type WorkspaceGitDiffStatus = "ok" | "not-a-repo" | "error";

export interface WorkspaceGitDiffResult {
  status: WorkspaceGitDiffStatus;
  changes: WorkspaceGitFileChange[];
}

// Built-in git badge kinds for the explorer file tree (`@pierre/trees`
// `GitStatus`). Matches the library's status set so renderer mapping is 1:1.
export type WorkspaceGitTreeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "ignored";

export interface WorkspaceGitStatusEntry {
  // Path relative to the workspace root (same identity as file-tree paths).
  path: string;
  status: WorkspaceGitTreeStatus;
}

// Outcome of a lightweight status request (no file contents). Same status
// enum as the full diff so empty-state handling can stay parallel.
export interface WorkspaceGitStatusResult {
  status: WorkspaceGitDiffStatus;
  entries: WorkspaceGitStatusEntry[];
}

export interface GitCommitResult {
  commitHash: string;
  message: string;
  // True when the subject was generated from the staged change set because the
  // caller submitted a blank message.
  generatedMessage: boolean;
}

export interface GitPushResult {
  branch: string;
  remote: string;
}
