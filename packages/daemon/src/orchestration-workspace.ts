import { execFile } from "node:child_process";
import { rmdir } from "node:fs/promises";
import path from "node:path";
import {
  decideWorkspaceIsolation,
  type WorkspaceIsolationDecision,
  type WorkspaceIsolationInput,
} from "@cocurdex/shared";
import { APP_WORKTREE_BRANCH_PREFIX } from "./git-worktree";
import {
  getWorktreeBasePath,
  hashRepoPath,
  isAppManagedWorktreePath,
} from "./paths";

export interface WorktreePathInput {
  repoRootPath: string;
  orchestrationRunId: string;
  agentTaskRunId: string;
  userDataPath?: string;
}

export interface WorkspaceAdmissionInput extends WorkspaceIsolationInput {
  repoRootPath: string;
}

export interface WorkspaceAdmissionResult extends WorkspaceIsolationDecision {
  isRepoDirty: boolean;
}

export function createWorktreePath(input: WorktreePathInput) {
  return path.join(
    getWorktreeBasePath(input.userDataPath),
    hashRepoPath(input.repoRootPath),
    input.orchestrationRunId,
    input.agentTaskRunId,
  );
}

export async function evaluateWorkspaceAdmission(
  input: WorkspaceAdmissionInput,
): Promise<WorkspaceAdmissionResult> {
  const isRepoDirty = await isGitWorkspaceDirty(input.repoRootPath);
  const decision = decideWorkspaceIsolation({ ...input, isRepoDirty });

  return { ...decision, isRepoDirty };
}

export async function removeAppManagedWorktree(input: {
  repoRootPath: string;
  worktreePath: string;
  userDataPath: string;
  worktreeRootPath?: string | null;
}): Promise<boolean> {
  if (
    !isAppManagedWorktreePath(
      input.worktreePath,
      input.userDataPath,
      input.worktreeRootPath,
    )
  ) {
    return false;
  }
  if (path.resolve(input.worktreePath) === path.resolve(input.repoRootPath)) {
    return false;
  }

  const branch = await readWorktreeBranch(input.worktreePath);
  try {
    await execGit(input.repoRootPath, [
      "worktree",
      "remove",
      input.worktreePath,
    ]);
    await rmdir(path.dirname(input.worktreePath)).catch(() => undefined);
  } catch {
    return false;
  }
  if (branch?.startsWith(APP_WORKTREE_BRANCH_PREFIX)) {
    await execGit(input.repoRootPath, ["branch", "-d", branch]).catch(
      () => undefined,
    );
  }
  return true;
}

async function readWorktreeBranch(worktreePath: string) {
  try {
    const output = await execGit(worktreePath, [
      "symbolic-ref",
      "--short",
      "-q",
      "HEAD",
    ]);
    return output.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function isGitWorkspaceDirty(repoRootPath: string) {
  const output = await execGit(repoRootPath, [
    "status",
    "--porcelain",
    "--untracked-files=normal",
  ]);

  return output.trim().length > 0;
}

function execGit(cwd: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}
