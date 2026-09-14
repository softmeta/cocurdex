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

// Remove files from the index without touching their working-tree changes, in
// a single `git reset` (one index lock, see stageGitFiles).
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

// Drop both staged and unstaged changes for one or more files. Tracked files
// are restored from HEAD (which also undoes deletions); a file that does not
// exist at HEAD was newly added, so discarding it means removing it from disk.
export async function discardGitFiles(
  rootPath: string,
  filePaths: string[],
): Promise<void> {
  if (filePaths.length === 0) return;
  const git = createGitClient(rootPath);
  // Unstage everything first so the index no longer pins added/edited revisions.
  await git.raw(["reset", "-q", "HEAD", "--", ...filePaths]).catch(() => {});

  // Partition by whether the path exists at HEAD. `git checkout -- <paths>`
  // fails atomically if any path is newly added, which used to force a per-file
  // fallback: one git spawn per file, so "discard all" scaled linearly with the
  // file count. Reading the HEAD tree once keeps the spawn count constant.
  const headPaths = await listHeadPaths(git);
  const tracked: string[] = [];
  const added: string[] = [];
  for (const filePath of filePaths) {
    (headPaths.has(filePath) ? tracked : added).push(filePath);
  }

  // Restore tracked files in a single checkout (also undoes deletions), and
  // remove newly added files in parallel since they have no HEAD revision.
  await Promise.all([
    tracked.length > 0 ? git.checkout(["--", ...tracked]) : Promise.resolve(),
    ...added.map((filePath) =>
      rm(path.join(rootPath, filePath), { force: true }),
    ),
  ]);
}

// List every path tracked at HEAD as a Set for O(1) membership checks. Empty on
// an unborn HEAD (fresh repo), so every path is treated as newly added.
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
