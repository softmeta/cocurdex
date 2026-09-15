import { homedir } from "node:os";
import {
  collectKnownWorkspaceScanRoots,
  isKnownWorkspaceScanRoot,
} from "@cocurdex/shared";
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
  };
}

export type WorkspaceScanPolicy = ReturnType<typeof createWorkspaceScanPolicy>;
