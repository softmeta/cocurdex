import { execFile, spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GIT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: "Cocurdex",
  GIT_AUTHOR_EMAIL: "cocurdex@localhost",
  GIT_COMMITTER_NAME: "Cocurdex",
  GIT_COMMITTER_EMAIL: "cocurdex@localhost",
};

/** Runs git with stdin content — used for batched `cat-file --batch-check`. */
export function runGitWithInput(
  args: string[],
  options: { cwd: string; input: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      env: { ...process.env, ...GIT_IDENTITY_ENV },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || `git ${args[0]} exited with ${code}`));
    });
    child.stdin.end(options.input);
  });
}

export async function runGit(
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
  },
) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...GIT_IDENTITY_ENV,
        ...options.env,
      },
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    return result.stdout;
  } catch (error) {
    if (options.allowFailure) {
      return "";
    }
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "";
    throw new Error(
      stderr.trim() || (error instanceof Error ? error.message : String(error)),
    );
  }
}

export async function isGitWorkspace(workspaceRootPath: string) {
  const output = await runGit(["rev-parse", "--show-toplevel"], {
    cwd: workspaceRootPath,
    allowFailure: true,
  });
  const toplevel = output.trim();
  if (!toplevel) {
    return false;
  }
  try {
    return (await realpath(toplevel)) === (await realpath(workspaceRootPath));
  } catch {
    return path.resolve(toplevel) === path.resolve(workspaceRootPath);
  }
}
