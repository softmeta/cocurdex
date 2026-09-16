import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export function runGit(repoPath: string, args: string[]) {
  return execFileSync("git", args, { cwd: repoPath, encoding: "utf8" }).trim();
}

export interface GitRepositoryFixture {
  readonly path: string;
  dispose(): Promise<void>;
}

export async function createGitRepository(): Promise<GitRepositoryFixture> {
  const dir = mkdtempSync(path.join(tmpdir(), "cocurdex-e2e-repo-"));
  const repoPath = path.join(dir, "repo");
  await mkdir(repoPath);
  runGit(repoPath, ["init", "-b", "main"]);
  runGit(repoPath, ["config", "user.name", "Cocurdex E2E"]);
  runGit(repoPath, ["config", "user.email", "e2e@cocurdex.local"]);
  await writeFile(path.join(repoPath, "README.md"), "# Fixture\n");
  runGit(repoPath, ["add", "README.md"]);
  runGit(repoPath, ["commit", "-m", "Initial commit"]);
  return {
    path: repoPath,
    dispose: () =>
      rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
}
