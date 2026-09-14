import type { WorkspaceRecord } from "./contracts";

export function primaryWorkspaceRootPath(
  workspace: Pick<WorkspaceRecord, "rootPaths">,
): string {
  return workspace.rootPaths[0] ?? "";
}

export function normalizeWorkspaceRootPath(rootPath: string): string {
  if (rootPath === "/") {
    return "/";
  }
  let end = rootPath.length;
  while (end > 0 && (rootPath[end - 1] === "/" || rootPath[end - 1] === "\\")) {
    end -= 1;
  }
  return rootPath.slice(0, end);
}

export function workspacePathsEqual(left: string, right: string): boolean {
  const a = normalizeWorkspaceRootPath(left);
  const b = normalizeWorkspaceRootPath(right);
  const win =
    (globalThis as { process?: { platform?: string } }).process?.platform ===
      "win32" ||
    (typeof navigator !== "undefined" && /Win/i.test(navigator.platform));
  if (win) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

export function normalizeWorkspaceRootPaths(
  rootPaths: readonly string[],
): string[] {
  const normalized: string[] = [];
  for (const rootPath of rootPaths) {
    const next = normalizeWorkspaceRootPath(rootPath.trim());
    if (!next) {
      continue;
    }
    if (normalized.some((existing) => workspacePathsEqual(existing, next))) {
      continue;
    }
    normalized.push(next);
  }
  return normalized;
}

export function isFilesystemRootPath(rootPath: string): boolean {
  const normalized = normalizeWorkspaceRootPath(rootPath);
  return normalized === "/" || /^[A-Za-z]:$/.test(normalized);
}

export function isBroadFilesystemScanRoot(
  rootPath: string,
  homeDirectory: string,
): boolean {
  const normalized = normalizeWorkspaceRootPath(rootPath.trim());
  if (!normalized || isFilesystemRootPath(normalized)) {
    return true;
  }
  return workspacePathsEqual(normalized, homeDirectory);
}

export function collectKnownWorkspaceScanRoots(input: {
  workspaceRootPaths: readonly string[];
  worktreePaths?: readonly (string | null | undefined)[];
}): string[] {
  return normalizeWorkspaceRootPaths([
    ...input.workspaceRootPaths,
    ...(input.worktreePaths ?? []).filter((rootPath): rootPath is string =>
      Boolean(rootPath),
    ),
  ]);
}

export function isKnownWorkspaceScanRoot(
  rootPath: string,
  allowedRoots: readonly string[],
  homeDirectory: string,
): boolean {
  if (isBroadFilesystemScanRoot(rootPath, homeDirectory)) {
    return false;
  }
  return allowedRoots.some((allowed) => workspacePathsEqual(rootPath, allowed));
}
