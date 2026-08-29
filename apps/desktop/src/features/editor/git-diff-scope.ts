import type {
  GitBranchInfo,
  GitDiffScopeMode,
  WorkspaceGitDiffQuery,
} from "@/lib";

// Renderer-side scope state. Same shape as the IPC query; kept local so the
// panel can hold selection (commit hash, source/target) without inventing a
// second model.
export type GitDiffScope = WorkspaceGitDiffQuery;

export const GIT_DEFAULT_DIFF_SCOPE: GitDiffScope = { mode: "working" };

// Modes that still operate on the live worktree / index and allow stage/discard.
const MUTABLE_MODES = new Set<GitDiffScopeMode>([
  "working",
  "unstaged",
  "staged",
]);

export function isMutableScope(scope: GitDiffScope): boolean {
  return MUTABLE_MODES.has(scope.mode);
}

// Working-tree scopes should auto-reload on file edits; commit/branch only
// care about ref moves (still reloaded on git-state, but not required for
// correctness of the selection UI).
export function isWorkingTreeScope(scope: GitDiffScope): boolean {
  return isMutableScope(scope);
}

export function scopeToQuery(scope: GitDiffScope): WorkspaceGitDiffQuery {
  return scope;
}

// Left selector default: the currently checked-out local branch (the source
// under review).
export function pickDefaultSourceRef(
  refs: readonly GitBranchInfo[],
): string | null {
  if (refs.length === 0) return null;
  const currentLocal = refs.find((ref) => ref.current && ref.kind === "local");
  if (currentLocal) return currentLocal.name;
  const current = refs.find((ref) => ref.current);
  if (current) return current.name;
  const firstLocal = refs.find((ref) => ref.kind === "local");
  if (firstLocal) return firstLocal.name;
  return refs[0]?.name ?? null;
}

// Right selector default: the typical merge destination
// (origin/main → main → master → first non-current local).
export function pickDefaultTargetRef(
  refs: readonly GitBranchInfo[],
): string | null {
  if (refs.length === 0) return null;
  const names = new Set(refs.map((ref) => ref.name));
  for (const candidate of ["origin/main", "main", "master", "origin/master"]) {
    if (names.has(candidate)) return candidate;
  }
  const nonCurrentLocal = refs.find(
    (ref) => ref.kind === "local" && !ref.current,
  );
  if (nonCurrentLocal) return nonCurrentLocal.name;
  return refs[0]?.name ?? null;
}

// Build a branch scope with sensible defaults when the user first enters
// branch mode. Reuses prior source/target when still present in the ref list.
export function resolveBranchScope(
  refs: readonly GitBranchInfo[],
  previous: GitDiffScope | null,
): Extract<GitDiffScope, { mode: "branch" }> {
  const names = new Set(refs.map((ref) => ref.name));
  const prevSource =
    previous?.mode === "branch" && names.has(previous.source)
      ? previous.source
      : null;
  const prevTarget =
    previous?.mode === "branch" && names.has(previous.target)
      ? previous.target
      : null;
  const source =
    prevSource ??
    pickDefaultSourceRef(refs) ??
    prevTarget ??
    refs[0]?.name ??
    "main";
  let target =
    prevTarget ?? pickDefaultTargetRef(refs) ?? refs[0]?.name ?? "main";
  // Avoid a useless same-ref compare when we can pick a different target.
  if (target === source && refs.length > 1) {
    const other =
      refs.find((ref) => ref.name !== source && !ref.current) ??
      refs.find((ref) => ref.name !== source);
    if (other) target = other.name;
  }
  return { mode: "branch", source, target };
}

export function resolveCommitScope(
  commit: string,
): Extract<GitDiffScope, { mode: "commit" }> {
  return { mode: "commit", commit };
}

// Stable string key so effects can depend on scope without deep compare.
export function scopeKey(scope: GitDiffScope): string {
  switch (scope.mode) {
    case "working":
    case "unstaged":
    case "staged":
      return scope.mode;
    case "commit":
      return `commit:${scope.commit}`;
    case "branch":
      return `branch:${scope.source}->${scope.target}`;
  }
}
