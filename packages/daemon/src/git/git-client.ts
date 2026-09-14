import { realpath } from "node:fs/promises";
import path from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";

const GIT_COMMAND_TIMEOUT_MS = 30_000;
const GIT_MAX_CONCURRENT_PROCESSES = 4;

export interface GitRepositoryPaths {
  commonDir: string;
  gitDir: string;
}

export function createGitClient(rootPath: string): SimpleGit {
  return simpleGit({
    baseDir: rootPath,
    maxConcurrentProcesses: GIT_MAX_CONCURRENT_PROCESSES,
    timeout: {
      block: GIT_COMMAND_TIMEOUT_MS,
    },
  });
}

async function resolveRepositoryPath(
  rootPath: string,
  repositoryPath: string,
): Promise<string> {
  const trimmedPath = repositoryPath.trim();
  const resolvedPath = path.normalize(
    path.isAbsolute(trimmedPath)
      ? trimmedPath
      : path.resolve(rootPath, trimmedPath),
  );
  return realpath(resolvedPath);
}

export async function resolveGitRepositoryPaths(
  rootPath: string,
): Promise<GitRepositoryPaths | null> {
  const git = createGitClient(rootPath);
  try {
    const [gitDir, commonDir] = await Promise.all([
      git.raw(["rev-parse", "--absolute-git-dir"]),
      git.raw(["rev-parse", "--git-common-dir"]),
    ]);
    const [resolvedGitDir, resolvedCommonDir] = await Promise.all([
      resolveRepositoryPath(rootPath, gitDir),
      resolveRepositoryPath(rootPath, commonDir),
    ]);
    return { commonDir: resolvedCommonDir, gitDir: resolvedGitDir };
  } catch {
    return null;
  }
}
