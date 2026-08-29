import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import type { TurnFileChange } from "@cocurdex/shared";

export class UnsafeWorkspacePathError extends Error {
  override readonly name = "UnsafeWorkspacePathError";
}

export function normalizeRelativePath(relativePath: string) {
  const trimmed = relativePath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === "." || trimmed === "./") {
    throw new UnsafeWorkspacePathError("Workspace path is empty");
  }
  if (path.isAbsolute(trimmed) || /^[a-zA-Z]:/.test(trimmed)) {
    throw new UnsafeWorkspacePathError("Workspace path must be relative");
  }
  const posix = path.posix.normalize(trimmed);
  if (posix.startsWith("..") || posix.includes("/../") || posix === "..") {
    throw new UnsafeWorkspacePathError("Workspace path escapes the workspace");
  }
  return posix.replace(/^\.\//, "");
}

export function resolveWorkspacePath(
  workspaceRootPath: string,
  relativePath: string,
) {
  const normalized = normalizeRelativePath(relativePath);
  const root = path.resolve(workspaceRootPath);
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new UnsafeWorkspacePathError("Workspace path escapes the workspace");
  }
  return { absolute, relative: normalized };
}

function pathEscapes(realRoot: string, candidate: string) {
  const relative = path.relative(realRoot, candidate);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

export async function assertSafeWorkspaceFile(
  workspaceRootPath: string,
  relativePath: string,
) {
  const resolved = resolveWorkspacePath(workspaceRootPath, relativePath);
  const realRoot = await realpath(workspaceRootPath);
  const root = path.resolve(workspaceRootPath);
  let current = resolved.absolute;
  let sawExisting = false;

  while (true) {
    const stats = await lstat(current).catch(() => null);
    if (stats) {
      sawExisting = true;
      if (stats.isSymbolicLink()) {
        throw new UnsafeWorkspacePathError(
          `Refusing to use symlink at ${path.relative(root, current) || "."}`,
        );
      }
      if (current === resolved.absolute && stats.nlink > 1 && stats.isFile()) {
        throw new UnsafeWorkspacePathError(
          `Refusing to use hard-linked file at ${resolved.relative}`,
        );
      }
      const realCurrent = await realpath(current);
      if (pathEscapes(realRoot, realCurrent)) {
        throw new UnsafeWorkspacePathError(
          `Workspace path resolves outside the workspace: ${resolved.relative}`,
        );
      }
    }

    if (path.resolve(current) === root) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  if (!sawExisting) {
    throw new UnsafeWorkspacePathError(
      `Workspace path has no existing ancestor: ${resolved.relative}`,
    );
  }

  const exists = (await lstat(resolved.absolute).catch(() => null)) != null;
  return { ...resolved, exists, isSymlink: false };
}

export async function assertSafeRestorePlan(
  workspaceRootPath: string,
  plan: { path: string; previousPath?: string | null },
) {
  const target = await assertSafeWorkspaceFile(workspaceRootPath, plan.path);
  if (plan.previousPath) {
    await assertSafeWorkspaceFile(workspaceRootPath, plan.previousPath);
  }
  return target;
}

export function sanitizeTurnFileChange(
  file: TurnFileChange,
): TurnFileChange | null {
  try {
    return {
      ...file,
      path: normalizeRelativePath(file.path),
      previousPath: file.previousPath
        ? normalizeRelativePath(file.previousPath)
        : (file.previousPath ?? null),
    };
  } catch {
    return null;
  }
}

export function sanitizeTurnFileChanges(files: TurnFileChange[]) {
  return files.flatMap((file) => {
    const sanitized = sanitizeTurnFileChange(file);
    return sanitized ? [sanitized] : [];
  });
}
