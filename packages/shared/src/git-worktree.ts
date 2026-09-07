export interface GitWorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
  bare: boolean;
}

interface WorktreeDraft {
  path: string;
  head: string;
  branch: string | null;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
  bare: boolean;
}

function emptyDraft(): WorktreeDraft {
  return {
    path: "",
    head: "",
    branch: null,
    detached: false,
    locked: false,
    prunable: false,
    bare: false,
  };
}

function finishDraft(draft: WorktreeDraft): GitWorktreeInfo | null {
  if (!draft.path) {
    return null;
  }

  return {
    path: draft.path,
    head: draft.head,
    branch: draft.branch,
    detached: draft.detached,
    locked: draft.locked,
    prunable: draft.prunable,
    bare: draft.bare,
  };
}

export function parseGitWorktreeList(porcelain: string): GitWorktreeInfo[] {
  const worktrees: GitWorktreeInfo[] = [];
  let draft = emptyDraft();

  const flush = () => {
    const finished = finishDraft(draft);
    if (finished) {
      worktrees.push(finished);
    }
    draft = emptyDraft();
  };

  for (const rawLine of porcelain.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      flush();
      continue;
    }

    if (line.startsWith("worktree ")) {
      flush();
      draft.path = line.slice("worktree ".length);
      continue;
    }

    if (line.startsWith("HEAD ")) {
      draft.head = line.slice("HEAD ".length);
      continue;
    }

    if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      draft.branch = ref.replace(/^refs\/heads\//, "");
      draft.detached = false;
      continue;
    }

    if (line === "detached") {
      draft.detached = true;
      draft.branch = null;
      continue;
    }

    if (line === "bare") {
      draft.bare = true;
      continue;
    }

    if (line === "locked" || line.startsWith("locked ")) {
      draft.locked = true;
      continue;
    }

    if (line === "prunable" || line.startsWith("prunable ")) {
      draft.prunable = true;
    }
  }

  flush();
  return worktrees;
}

export function resolveSessionWorkingPath(input: {
  workspaceRootPath: string;
  worktreePath?: string | null;
}): string {
  const worktreePath = input.worktreePath?.trim();
  if (!worktreePath) {
    return input.workspaceRootPath;
  }
  return worktreePath;
}

export function suggestWorktreeBranchName(id: string): string {
  const slug = id
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase();
  if (!slug) {
    return "cocurdex/worktree";
  }
  return `cocurdex/${slug}`;
}

export function remapPathUnderRoot(
  filePath: string,
  fromRoot: string,
  toRoot: string,
): string {
  const from = fromRoot.replace(/[\\/]+$/, "");
  const to = toRoot.replace(/[\\/]+$/, "");
  if (filePath === from) {
    return to;
  }
  if (filePath.startsWith(`${from}/`) || filePath.startsWith(`${from}\\`)) {
    return `${to}${filePath.slice(from.length)}`;
  }
  return filePath;
}
