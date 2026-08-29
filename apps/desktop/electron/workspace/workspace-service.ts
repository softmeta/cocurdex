import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceEntry, WorkspaceFileEntry } from "@/lib/types";
import { createGitClient } from "./git-client";

const MAX_WORKSPACE_FILE_RESULTS = 5000;
const FD_TIMEOUT_MS = 5000;
const activePathCommands = new Set<ChildProcessWithoutNullStreams>();
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  "dist",
  "node_modules",
  "out",
]);

type WorkspacePathKind = WorkspaceFileEntry["kind"];

function getFdTarget() {
  return `${process.platform}-${process.arch === "x64" ? "x64" : process.arch}`;
}

function getProcessResourcesPath() {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

async function resolveFdPath() {
  const executable = process.platform === "win32" ? "fd.exe" : "fd";
  const target = getFdTarget();
  const candidates = [
    path.resolve(process.cwd(), "vendor/fd", target, executable),
    getProcessResourcesPath()
      ? path.join(
          getProcessResourcesPath() ?? "",
          "vendor/fd",
          target,
          executable,
        )
      : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next candidate before falling back to the Node walker.
    }
  }

  return null;
}

function runPathCommand(command: string, args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    activePathCommands.add(child);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error("Workspace file listing timed out."));
    }, FD_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      activePathCommands.delete(child);
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      activePathCommands.delete(child);
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeout);

      if (code !== 0 && code !== null && stderr.trim()) {
        reject(new Error(stderr.trim()));
        return;
      }

      resolve(stdout);
    });
  });
}

export function closeAllWorkspacePathCommands() {
  const failures: unknown[] = [];
  for (const child of activePathCommands) {
    try {
      child.kill();
    } catch (error) {
      failures.push(error);
    }
  }
  activePathCommands.clear();
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "Failed to stop workspace path commands",
    );
  }
}

function createWorkspaceFileEntry(
  rootPath: string,
  relativePath: string,
  kind: WorkspacePathKind,
): WorkspaceFileEntry | null {
  const normalizedRelativePath = relativePath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/$/, "")
    .trim();
  if (!normalizedRelativePath || normalizedRelativePath === ".") {
    return null;
  }

  return {
    kind,
    name: path.basename(normalizedRelativePath),
    path: path.join(rootPath, normalizedRelativePath),
    relativePath: normalizedRelativePath,
  };
}

function parsePathCommandOutput(
  rootPath: string,
  output: string,
  kind: WorkspacePathKind,
) {
  return output
    .split(/\r?\n/)
    .map((line) => createWorkspaceFileEntry(rootPath, line, kind))
    .filter((entry): entry is WorkspaceFileEntry => Boolean(entry));
}

async function listWorkspaceFilesWithFd(rootPath: string, fdPath: string) {
  const baseArgs = [
    "--base-directory",
    rootPath,
    "--max-results",
    String(MAX_WORKSPACE_FILE_RESULTS),
    "--follow",
    "--hidden",
    "--exclude",
    ".git",
    "--exclude",
    ".git/*",
    "--exclude",
    ".git/**",
  ];
  const [directoryOutput, fileOutput] = await Promise.all([
    runPathCommand(fdPath, [...baseArgs, "--type", "d"], rootPath),
    runPathCommand(fdPath, [...baseArgs, "--type", "f"], rootPath),
  ]);

  return [
    ...parsePathCommandOutput(rootPath, directoryOutput, "directory"),
    ...parsePathCommandOutput(rootPath, fileOutput, "file"),
  ].slice(0, MAX_WORKSPACE_FILE_RESULTS);
}

async function listWorkspaceFilesWithNode(rootPath: string) {
  const files: WorkspaceFileEntry[] = [];

  async function walk(currentPath: string) {
    if (files.length >= MAX_WORKSPACE_FILE_RESULTS) {
      return;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= MAX_WORKSPACE_FILE_RESULTS) {
        return;
      }

      const nextPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, nextPath);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          files.push({
            kind: "directory",
            name: entry.name,
            path: nextPath,
            relativePath,
          });
          await walk(nextPath);
        }
        continue;
      }

      if (entry.isFile()) {
        files.push({
          kind: "file",
          name: entry.name,
          path: nextPath,
          relativePath,
        });
      }
    }
  }

  await walk(rootPath);
  return files;
}

export async function readWorkspaceEntries(
  rootPath: string,
): Promise<WorkspaceEntry[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });

  const mappedEntries: WorkspaceEntry[] = entries.map((entry) => {
    const entryPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      return {
        name: entry.name,
        path: entryPath,
        type: "folder" as const,
      };
    }

    return {
      name: entry.name,
      path: entryPath,
      type: "file" as const,
    };
  });

  return mappedEntries.sort((left: WorkspaceEntry, right: WorkspaceEntry) => {
    if (left.type !== right.type) {
      return left.type === "folder" ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export async function listWorkspaceFiles(
  rootPath: string,
): Promise<WorkspaceFileEntry[]> {
  const fdPath = await resolveFdPath();
  if (fdPath) {
    try {
      return await listWorkspaceFilesWithFd(rootPath, fdPath);
    } catch {
      // Keep workspace browsing usable if fd is unavailable on this host.
    }
  }

  return listWorkspaceFilesWithNode(rootPath);
}

// Stage one or more files' working-tree changes (including deletions, via
// `-A`). All paths go through a single `git add` so the index is locked once;
// running one process per file serialised ~60ms of spawn overhead each, which
// is what made "stage all" feel laggy.
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

export function readTextFile(filePath: string) {
  return readFile(filePath, "utf8");
}

// Cheap existence probe for clickable file paths in chat messages. Uses stat()
// rather than reading the file so hovering a path never pulls its contents.
// Directories are excluded so only regular files are made clickable.
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}
