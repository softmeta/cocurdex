import { type GitWorktreeInfo, parseGitWorktreeList } from "@cocurdex/shared";
import { createGitClient } from "./git-client";

export async function listGitWorktrees(
  rootPath: string,
): Promise<GitWorktreeInfo[]> {
  const git = createGitClient(rootPath);
  try {
    if (!(await git.checkIsRepo())) {
      return [];
    }
    const porcelain = await git.raw(["worktree", "list", "--porcelain"]);
    return parseGitWorktreeList(porcelain).filter(
      (worktree) => !worktree.bare && !worktree.prunable,
    );
  } catch {
    return [];
  }
}
