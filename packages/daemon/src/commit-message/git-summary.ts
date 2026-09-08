import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseNameStatusZero } from "./git-name-status";

const execFileAsync = promisify(execFile);
const MAX_CHANGE_SUMMARY_CHARS = 24_000;

async function runGit(rootPath: string, args: string[], indexPath?: string) {
  const result = await execFileAsync("git", args, {
    cwd: rootPath,
    env: indexPath
      ? { ...process.env, GIT_INDEX_FILE: indexPath }
      : process.env,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return result.stdout;
}

async function summarizeIndex(rootPath: string, indexPath?: string) {
  const raw = await runGit(
    rootPath,
    ["diff", "--cached", "--name-status", "-z"],
    indexPath,
  );
  const changes = parseNameStatusZero(raw);
  if (changes.length === 0) {
    throw new Error("Nothing to commit");
  }
  const diff = await runGit(
    rootPath,
    ["diff", "--cached", "--no-color", "--no-ext-diff", "--unified=3"],
    indexPath,
  );
  const nameStatus = changes
    .map((change) => {
      if (change.fromPath) {
        return `${change.status}\t${change.fromPath}\t${change.path}`;
      }
      return `${change.status}\t${change.path}`;
    })
    .join("\n");
  const body = `Staged paths:\n${nameStatus}\n\nStaged diff:\n${diff.trim()}`;
  if (body.length <= MAX_CHANGE_SUMMARY_CHARS) {
    return `Staged changes (${changes.length} path(s)):\n${body}`;
  }
  return `Staged changes (${changes.length} path(s), truncated):\n${body.slice(0, MAX_CHANGE_SUMMARY_CHARS)}…`;
}

export async function collectCommitChangeSummary(
  rootPath: string,
  includeUnstaged: boolean,
) {
  if (!includeUnstaged) {
    return summarizeIndex(rootPath);
  }
  const originalIndexTree = (await runGit(rootPath, ["write-tree"])).trim();
  const directory = await mkdtemp(path.join(tmpdir(), "cocurdex-git-index-"));
  const indexPath = path.join(directory, "index");
  try {
    await runGit(rootPath, ["read-tree", originalIndexTree], indexPath);
    await runGit(rootPath, ["add", "-A"], indexPath);
    return await summarizeIndex(rootPath, indexPath);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
