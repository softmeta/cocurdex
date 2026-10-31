import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type GitWorktreeInfo, parseGitWorktreeList } from "@cocurdex/shared";
import {
  createSessionWorktreePath,
  getWorktreeBasePath,
  resolveExistingPath,
} from "./paths";
import { runGit } from "./workspace-changes/git-run";

export const APP_WORKTREE_BRANCH_PREFIX = "cocurdex/";

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
  branch?: string;
  startPoint?: string;
  userDataPath: string;
  worktreeRootPath?: string | null;
  fetchBeforeCreate?: boolean;
}): Promise<GitWorktreeInfo> {
  const worktreeId = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const branch =
    input.branch?.trim() || `${APP_WORKTREE_BRANCH_PREFIX}${worktreeId}`;
  await runGit(["check-ref-format", "--branch", branch], {
    cwd: input.repoRootPath,
  });

  if (input.fetchBeforeCreate) {
    await fetchGitUpstreams(input.repoRootPath);
  }

  const worktreePath = createSessionWorktreePath({
    repoRootPath: input.repoRootPath,
    worktreeId,
    userDataPath: input.userDataPath,
    worktreeRootPath: input.worktreeRootPath,
  });
  await mkdir(path.dirname(worktreePath), { recursive: true });
  if (process.platform === "darwin") {
    await writeFile(
      path.join(
        getWorktreeBasePath(input.userDataPath, input.worktreeRootPath),
        ".metadata_never_index",
      ),
      "",
    );
  }

  const startPoint = input.startPoint?.trim() || "HEAD";
  await runGit(["worktree", "add", "-b", branch, worktreePath, startPoint], {
    cwd: input.repoRootPath,
  });

  const worktrees = await listGitWorktrees(input.repoRootPath);
  const resolvedPath = resolveExistingPath(worktreePath);
  const created = worktrees.find(
    (worktree) => resolveExistingPath(worktree.path) === resolvedPath,
  );
  if (created) {
    return created;
  }

  return {
    path: worktreePath,
    head: "",
    branch,
    detached: false,
    locked: false,
    prunable: false,
    bare: false,
  };
}
