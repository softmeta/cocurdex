import { createGitClient } from "./git-client";

export async function checkoutGitBranch(
  rootPath: string,
  branch: string,
): Promise<void> {
  const git = createGitClient(rootPath);

  await git.raw(["check-ref-format", "--branch", branch]);
  await git.raw(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  await git.raw(["checkout", "--quiet", branch]);
}
