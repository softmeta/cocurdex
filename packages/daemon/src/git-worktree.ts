import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { type GitWorktreeInfo, parseGitWorktreeList } from "@cocurdex/shared";
import { createSessionWorktreePath } from "./paths";
import { runGit } from "./workspace-changes/git-run";

export async function listGitWorktrees(
  rootPath: string,
): Promise<GitWorktreeInfo[]> {
  const porcelain = await runGit(["worktree", "list", "--porcelain"], {
    cwd: rootPath,
    allowFailure: true,
  });
  if (!porcelain.trim()) {
    return [];
  }
  return parseGitWorktreeList(porcelain).filter(
    (worktree) => !worktree.bare && !worktree.prunable,
  );
}

export async function fetchGitUpstreams(rootPath: string) {
  const remotes = await runGit(["remote"], {
    cwd: rootPath,
    allowFailure: true,
  });
  if (!remotes.trim()) {
    return;
  }
  await runGit(["fetch", "--all", "--prune"], { cwd: rootPath });
}

export async function addGitWorktree(input: {
  repoRootPath: string;
  branch: string;
  startPoint?: string;
  userDataPath: string;
  worktreeRootPath?: string | null;
  fetchBeforeCreate?: boolean;
}): Promise<GitWorktreeInfo> {
  await runGit(["check-ref-format", "--branch", input.branch], {
    cwd: input.repoRootPath,
  });

  if (input.fetchBeforeCreate) {
    await fetchGitUpstreams(input.repoRootPath);
  }

  const worktreeId = crypto.randomUUID();
  const worktreePath = createSessionWorktreePath({
    repoRootPath: input.repoRootPath,
    worktreeId,
    userDataPath: input.userDataPath,
    worktreeRootPath: input.worktreeRootPath,
  });
  await mkdir(path.dirname(worktreePath), { recursive: true });

  const startPoint = input.startPoint?.trim() || "HEAD";
  await runGit(
    ["worktree", "add", "-b", input.branch, worktreePath, startPoint],
    { cwd: input.repoRootPath },
  );

  const worktrees = await listGitWorktrees(input.repoRootPath);
  try {
    const resolvedPath = await realpath(worktreePath);
    const created = worktrees.find(
      (worktree) => worktree.path === resolvedPath,
    );
    if (created) {
      return created;
    }
  } catch {
    const created = worktrees.find(
      (worktree) => worktree.path === worktreePath,
    );
    if (created) {
      return created;
    }
  }

  return {
    path: worktreePath,
    head: "",
    branch: input.branch,
    detached: false,
    locked: false,
    prunable: false,
    bare: false,
  };
}
