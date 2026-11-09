import type { GitCommitResult, GitPushResult } from "@cocurdex/shared";
import { createGitClient } from "./git-client";

export interface CommitGitChangesOptions {
  message: string;
  includeUnstaged: boolean;
}

export async function commitGitChanges(
  rootPath: string,
  options: CommitGitChangesOptions,
): Promise<Omit<GitCommitResult, "generatedMessage">> {
  const git = createGitClient(rootPath);
  const message = options.message.trim();
  if (message.length === 0) {
    throw new Error("Commit message is required");
  }

  const originalIndexTree = options.includeUnstaged
    ? (await git.raw(["write-tree"])).trim()
    : null;

  try {
    if (options.includeUnstaged) {
      await git.raw(["add", "-A"]);
    }

    const result = await git.commit(message);
    const commitHash = result.commit.trim();
    if (commitHash.length === 0) {
      throw new Error("Nothing to commit");
    }

    return { commitHash, message };
  } catch (error) {
    if (originalIndexTree) {
      try {
        await git.raw(["read-tree", originalIndexTree]);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "Commit failed and the previous Git index could not be restored",
        );
      }
    }
    throw error;
  }
}

export async function pushGitBranch(rootPath: string): Promise<GitPushResult> {
  const git = createGitClient(rootPath);
  const status = await git.status();
  const branch = status.current?.trim() ?? "";
  if (branch.length === 0 || branch === "HEAD") {
    throw new Error("Not on a branch");
  }

  const tracking = status.tracking?.trim() ?? "";
  if (tracking.length > 0) {
    await git.push();
    const remote = tracking.includes("/")
      ? (tracking.split("/")[0] ?? "origin")
      : "origin";
    return { branch, remote };
  }

  const remotes = await git.getRemotes(false);
  const origin =
    remotes.find((remote) => remote.name === "origin") ?? remotes[0];
  if (!origin) {
    throw new Error("No remote configured");
  }

  await git.push(origin.name, branch, ["--set-upstream"]);
  return { branch, remote: origin.name };
}
