import { generateCommitMessageFromConfiguredModel } from "../provider/commit-message-generation";
import { createGitClient } from "./git-client";

export interface CommitGitChangesOptions {
  // Empty / whitespace-only → one-shot model generation from staged name-status
  // after optional includeUnstaged staging. Never creates a chat session.
  // Blank message requires a configured model that succeeds.
  message: string;
  // When true, stage the entire worktree (`git add -A`) before committing so
  // unstaged and untracked changes land in the same commit as the index.
  includeUnstaged: boolean;
}

export interface CommitGitChangesResult {
  commitHash: string;
  message: string;
  // True when the subject was produced by the configured model, not the user.
  generatedMessage: boolean;
}

export interface PushGitBranchResult {
  branch: string;
  remote: string;
}

export async function generateGitCommitMessage(
  rootPath: string,
  options: { includeUnstaged: boolean },
): Promise<string> {
  return generateCommitMessageFromConfiguredModel(rootPath, options);
}

// Commit staged changes (optionally after staging the whole worktree). When
// the message is blank, require a one-shot model completion. Surfaces failures
// as thrown Errors so the renderer can toast them.
export async function commitGitChanges(
  rootPath: string,
  options: CommitGitChangesOptions,
): Promise<CommitGitChangesResult> {
  const git = createGitClient(rootPath);
  const userMessage = options.message.trim();
  let message = userMessage;
  let generatedMessage = false;

  if (message.length === 0) {
    message = await generateGitCommitMessage(rootPath, {
      includeUnstaged: options.includeUnstaged,
    });
    generatedMessage = true;
  }

  // Keep model generation outside the real-index transaction. The temporary
  // index above lets the model see all changes without widening the window in
  // which a failure would require restoring the user's partial staging.
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
      // simple-git returns an empty commit hash when git reports nothing to
      // commit (or when a hook aborted without a new object).
      throw new Error("Nothing to commit");
    }

    return { commitHash, message, generatedMessage };
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

// Push the current branch to its upstream remote, or set upstream on `origin`
// when no tracking branch is configured yet.
export async function pushGitBranch(
  rootPath: string,
): Promise<PushGitBranchResult> {
  const git = createGitClient(rootPath);
  const status = await git.status();
  const branch = status.current?.trim() ?? "";
  if (branch.length === 0 || branch === "HEAD") {
    throw new Error("Not on a branch");
  }

  const tracking = status.tracking?.trim() ?? "";
  if (tracking.length > 0) {
    // Tracking form is "remote/branch" — push through the configured upstream.
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
