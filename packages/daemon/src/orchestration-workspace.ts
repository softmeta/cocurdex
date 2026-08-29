import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  decideWorkspaceIsolation,
  type WorkspaceIsolationDecision,
  type WorkspaceIsolationInput,
} from "@cocurdex/shared";
import { getWorktreeBasePath } from "./paths";

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
    hashPath(input.repoRootPath),
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

export async function isGitWorkspaceDirty(repoRootPath: string) {
  const output = await execGit(repoRootPath, [
    "status",
    "--porcelain",
    "--untracked-files=normal",
  ]);

  return output.trim().length > 0;
}

function hashPath(value: string) {
  return createHash("sha256")
    .update(path.resolve(value))
    .digest("hex")
    .slice(0, 16);
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
