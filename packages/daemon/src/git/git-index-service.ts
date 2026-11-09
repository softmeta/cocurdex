import { rm } from "node:fs/promises";
import path from "node:path";
import { createGitClient } from "./git-client";

export async function stageGitFiles(
  rootPath: string,
  filePaths: string[],
): Promise<void> {
  if (filePaths.length === 0) return;
  await createGitClient(rootPath).raw(["add", "-A", "--", ...filePaths]);
}

export async function unstageGitFiles(
  rootPath: string,
  filePaths: string[],
): Promise<void> {
  if (filePaths.length === 0) return;
  await createGitClient(rootPath).raw([
    "reset",
    "-q",
    "HEAD",
    "--",
    ...filePaths,
  ]);
}

export async function discardGitFiles(
  rootPath: string,
  filePaths: string[],
): Promise<void> {
  if (filePaths.length === 0) return;
  const git = createGitClient(rootPath);
  await git.raw(["reset", "-q", "HEAD", "--", ...filePaths]).catch(() => {});

  const headPaths = await listHeadPaths(git);
  const tracked: string[] = [];
  const added: string[] = [];
  for (const filePath of filePaths) {
    (headPaths.has(filePath) ? tracked : added).push(filePath);
  }

  await Promise.all([
    tracked.length > 0 ? git.checkout(["--", ...tracked]) : Promise.resolve(),
    ...added.map((filePath) =>
      rm(path.join(rootPath, filePath), { force: true }),
    ),
  ]);
}

async function listHeadPaths(
  git: ReturnType<typeof createGitClient>,
): Promise<Set<string>> {
  try {
    const raw = await git.raw(["ls-tree", "-r", "--name-only", "-z", "HEAD"]);
    return new Set(raw.split("\0").filter((entry) => entry.length > 0));
  } catch {
    return new Set();
  }
}
