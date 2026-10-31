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

interface KnownRoots {
  roots: string[];
  realRoots: string[];
}

// Roots a client may scan (browse, search): registered workspace roots plus
// session and git worktrees. The list is cached briefly; callers that mutate
// workspaces or worktrees should invalidate it.
export function createWorkspaceScanPolicy(state: DaemonState) {
  let cacheGeneration = 0;
  let knownRootsCache: { expiresAt: number; roots: KnownRoots } | null = null;
  let inFlight: Promise<KnownRoots> | null = null;

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

  async function loadKnownRoots(): Promise<KnownRoots> {
    const roots = await loadKnownWorkspaceScanRoots();
    const realRoots = await Promise.all(
      roots.map((rootPath) =>
        realpath(rootPath).catch(() => path.resolve(rootPath)),
      ),
    );
    return { roots, realRoots };
  }

  function startLoad() {
    const load = loadKnownRoots();
    inFlight = load;
    const settle = () => {
      if (inFlight === load) inFlight = null;
    };
    load.then(settle, settle);
    return load;
  }

  async function knownRoots(): Promise<KnownRoots> {
    if (knownRootsCache && Date.now() < knownRootsCache.expiresAt) {
      return knownRootsCache.roots;
    }
    const generation = cacheGeneration;
    const load = inFlight ?? startLoad();
    const loaded = await load;
    if (generation !== cacheGeneration) {
      return knownRoots();
    }
    knownRootsCache = {
      expiresAt: Date.now() + KNOWN_ROOTS_TTL_MS,
      roots: loaded,
    };
    return loaded;
  }

  return {
    invalidate() {
      cacheGeneration += 1;
      knownRootsCache = null;
      inFlight = null;
    },
    async canScan(rootPath: string) {
      const { roots } = await knownRoots();
      return isKnownWorkspaceScanRoot(rootPath, roots, homedir());
    },
    // File-level access (readText/exists): the candidate may be any path
    // inside an allowed root, not a root itself. Both sides are canonicalized
    // so a symlink inside a workspace cannot escape the allowlist.
    async canAccessFile(filePath: string) {
      const { realRoots } = await knownRoots();
      const resolved = await realpath(filePath).catch(() =>
        path.resolve(filePath),
      );
      return isPathWithinRoots(resolved, realRoots);
    },
  };
}

export type WorkspaceScanPolicy = ReturnType<typeof createWorkspaceScanPolicy>;
