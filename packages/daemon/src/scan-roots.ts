import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  collectKnownWorkspaceScanRoots,
  isKnownWorkspaceScanRoot,
} from "@cocurdex/shared";
import { isPathWithinRoots } from "@cocurdex/shared/node";
import { listGitWorktrees } from "./git";
import type { DaemonState } from "./state";

const KNOWN_ROOTS_TTL_MS = 2_000;

// Roots a client may scan (browse, search): registered workspace roots plus
// session and git worktrees. The list is cached briefly; callers that mutate
// workspaces or worktrees should invalidate it.
export function createWorkspaceScanPolicy(state: DaemonState) {
  let cacheGeneration = 0;
  let knownRootsCache: { expiresAt: number; roots: string[] } | null = null;

  async function loadKnownWorkspaceScanRoots() {
    const [workspaces, sessions, archived] = await Promise.all([
      state.listWorkspaces(),
      state.listSessions(),
      state.listArchivedSessions(),
    ]);
    const workspaceRootPaths = workspaces.flatMap(
      (workspace) => workspace.rootPaths,
    );
    const gitWorktreePaths = (
      await Promise.all(
        workspaceRootPaths.map((rootPath) =>
          listGitWorktrees(rootPath).catch(() => []),
        ),
      )
    ).flatMap((trees) => trees.map((tree) => tree.path));
    return collectKnownWorkspaceScanRoots({
      workspaceRootPaths,
      worktreePaths: [
        ...sessions.map((session) => session.worktreePath),
        ...archived.map((session) => session.worktreePath),
        ...gitWorktreePaths,
      ],
    });
  }

  async function listKnownWorkspaceScanRoots(): Promise<string[]> {
    if (knownRootsCache && Date.now() < knownRootsCache.expiresAt) {
      return knownRootsCache.roots;
    }
    const generation = cacheGeneration;
    const roots = await loadKnownWorkspaceScanRoots();
    if (generation !== cacheGeneration) {
      return listKnownWorkspaceScanRoots();
    }
    knownRootsCache = {
      expiresAt: Date.now() + KNOWN_ROOTS_TTL_MS,
      roots,
    };
    return roots;
  }

  return {
    invalidate() {
      cacheGeneration += 1;
      knownRootsCache = null;
    },
    async canScan(rootPath: string) {
      const allowed = await listKnownWorkspaceScanRoots();
      return isKnownWorkspaceScanRoot(rootPath, allowed, homedir());
    },
    // File-level access (readText/exists): the candidate may be any path
    // inside an allowed root, not a root itself. Both sides are canonicalized
    // so a symlink inside a workspace cannot escape the allowlist.
    async canAccessFile(filePath: string) {
      const allowed = await listKnownWorkspaceScanRoots();
      const realRoots = await Promise.all(
        allowed.map((rootPath) =>
          realpath(rootPath).catch(() => path.resolve(rootPath)),
        ),
      );
      const resolved = await realpath(filePath).catch(() =>
        path.resolve(filePath),
      );
      return isPathWithinRoots(resolved, realRoots);
    },
  };
}

export type WorkspaceScanPolicy = ReturnType<typeof createWorkspaceScanPolicy>;
