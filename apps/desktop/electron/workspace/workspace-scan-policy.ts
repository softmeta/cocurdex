import { homedir } from "node:os";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  collectKnownWorkspaceScanRoots,
  isKnownWorkspaceScanRoot,
} from "@cocurdex/shared";
import {
  chatDaemonOptions,
  listArchivedSessions,
  listSessions,
  listWorkspaces,
} from "../chat/app-state";

const KNOWN_ROOTS_TTL_MS = 2_000;

let knownRootsCache: { expiresAt: number; roots: string[] } | null = null;

export function invalidateKnownWorkspaceScanRootsCache() {
  knownRootsCache = null;
}

async function loadKnownWorkspaceScanRoots() {
  const [workspaces, sessions, archived, options] = await Promise.all([
    listWorkspaces(),
    listSessions(),
    listArchivedSessions(),
    chatDaemonOptions(),
  ]);
  const workspaceRootPaths = workspaces.flatMap(
    (workspace) => workspace.rootPaths,
  );
  const gitWorktreePaths = (
    await Promise.all(
      workspaceRootPaths.map((rootPath) =>
        requestDaemon("git.listWorktrees", { rootPath }, options).catch(
          () => [],
        ),
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

async function listKnownWorkspaceScanRoots() {
  if (knownRootsCache && Date.now() < knownRootsCache.expiresAt) {
    return knownRootsCache.roots;
  }
  const roots = await loadKnownWorkspaceScanRoots();
  knownRootsCache = {
    expiresAt: Date.now() + KNOWN_ROOTS_TTL_MS,
    roots,
  };
  return roots;
}

export async function canScanWorkspaceRoot(rootPath: string) {
  const allowed = await listKnownWorkspaceScanRoots();
  return isKnownWorkspaceScanRoot(rootPath, allowed, homedir());
}
