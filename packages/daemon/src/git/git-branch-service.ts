import { createGitClient } from "./git-client";

export async function checkoutGitBranch(
  rootPath: string,
  branch: string,
): Promise<void> {
  const git = createGitClient(rootPath);

  // Validate before passing the branch to checkout. `--branch` rejects names
  // that could be parsed as options, while show-ref limits this operation to
  // an existing local branch instead of creating one through remote DWIM.
  await git.raw(["check-ref-format", "--branch", branch]);
  await git.raw(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  await git.raw(["checkout", "--quiet", branch]);
}
