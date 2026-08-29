import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateCommitMessageFromConfiguredModel } from "../provider/commit-message-generation";
import { createGitClient } from "./git-client";
import { parseNameStatusZero } from "./git-name-status";

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

async function generateMessageFromIndex(
  rootPath: string,
  git: ReturnType<typeof createGitClient>,
) {
  const nameStatus = await git.raw(["diff", "--cached", "--name-status", "-z"]);
  const changes = parseNameStatusZero(nameStatus);
  if (changes.length === 0) {
    throw new Error("Nothing to commit");
  }
  const stagedDiff = await git.raw([
    "diff",
    "--cached",
    "--no-color",
    "--no-ext-diff",
    "--unified=3",
  ]);
  return generateCommitMessageFromConfiguredModel(
    rootPath,
    changes,
    stagedDiff,
  );
}

async function generateMessageForAllChanges(rootPath: string) {
  const git = createGitClient(rootPath);
  const originalIndexTree = (await git.raw(["write-tree"])).trim();
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "cocurdex-git-index-"),
  );
  const temporaryIndexPath = path.join(temporaryDirectory, "index");
  const temporaryGit = createGitClient(rootPath).env(
    "GIT_INDEX_FILE",
    temporaryIndexPath,
  );

  try {
    await temporaryGit.raw(["read-tree", originalIndexTree]);
    await temporaryGit.raw(["add", "-A"]);
    return await generateMessageFromIndex(rootPath, temporaryGit);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

// One-shot Conventional Commits draft for the renderer to fill the message
// field. Does not stage or commit; when includeUnstaged is true, builds a
// temporary index so the model sees the full worktree without mutating HEAD.
export async function generateGitCommitMessage(
  rootPath: string,
  options: { includeUnstaged: boolean },
): Promise<string> {
  if (options.includeUnstaged) {
    return generateMessageForAllChanges(rootPath);
  }
  const git = createGitClient(rootPath);
  return generateMessageFromIndex(rootPath, git);
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
