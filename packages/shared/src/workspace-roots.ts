import type { WorkspaceRecord } from "./contracts";

export function primaryWorkspaceRootPath(
  workspace: Pick<WorkspaceRecord, "rootPaths">,
): string {
  return workspace.rootPaths[0] ?? "";
}

export function normalizeWorkspaceRootPath(rootPath: string): string {
  if (rootPath === "/" || rootPath === "") {
    return rootPath || "/";
  }
  return rootPath.replace(/[\\/]+$/, "");
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
