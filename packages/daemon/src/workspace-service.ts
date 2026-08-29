import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkspaceFileRecord } from "./workspace-types";

const MAX_WORKSPACE_FILE_RESULTS = 5000;
const FD_TIMEOUT_MS = 5000;

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  "dist",
  "node_modules",
  "out",
]);

type WorkspacePathKind = WorkspaceFileRecord["kind"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getFdTarget() {
  return `${process.platform}-${process.arch === "x64" ? "x64" : process.arch}`;
}

function getProcessResourcesPath() {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

async function resolveFdPath() {
  const target = getFdTarget();
  const candidates = [
    path.resolve(
      __dirname,
      "../../../apps/desktop/vendor/fd",
      target,
      process.platform === "win32" ? "fd.exe" : "fd",
    ),
    getProcessResourcesPath()
      ? path.join(
          getProcessResourcesPath() ?? "",
          "vendor/fd",
          target,
          process.platform === "win32" ? "fd.exe" : "fd",
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

function execFileText(file: string, args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd, encoding: "utf8", timeout: FD_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }

        resolve(stdout);
      },
    );
  });
}

function createWorkspaceFileRecord(
  rootPath: string,
  relativePath: string,
  kind: WorkspacePathKind,
): WorkspaceFileRecord | null {
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

function parseFdOutput(
  rootPath: string,
  output: string,
  kind: WorkspacePathKind,
) {
  return output
    .split("\n")
    .map((line) => createWorkspaceFileRecord(rootPath, line, kind))
    .filter((entry): entry is WorkspaceFileRecord => Boolean(entry));
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
    execFileText(fdPath, [...baseArgs, "--type", "d"], rootPath),
    execFileText(fdPath, [...baseArgs, "--type", "f"], rootPath),
  ]);

  return [
    ...parseFdOutput(rootPath, directoryOutput, "directory"),
    ...parseFdOutput(rootPath, fileOutput, "file"),
  ].slice(0, MAX_WORKSPACE_FILE_RESULTS);
}

export async function listWorkspaceFiles(rootPath: string) {
  const fdPath = await resolveFdPath();
  if (fdPath) {
    try {
      return await listWorkspaceFilesWithFd(rootPath, fdPath);
    } catch {
      // Keep workspace browsing usable if the packaged binary is missing,
      // blocked, or incompatible with the host system.
    }
  }

  const files: WorkspaceFileRecord[] = [];

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

export async function listGitBranches(rootPath: string) {
  const output = await execGit(rootPath, [
    "branch",
    "--format=%(refname:short)",
  ]);
  return output
    .split("\n")
    .map((branch) => branch.trim())
    .filter(Boolean);
}

export async function getWorkspaceDiff(rootPath: string) {
  return execGit(rootPath, ["diff"]);
}

export function readTextFile(filePath: string) {
  return readFile(filePath, "utf8");
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
