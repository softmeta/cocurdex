import { type FSWatcher, watch } from "node:fs";
import path from "node:path";
import { resolveGitRepositoryPaths } from "./git-client";

// Coalesce fs event bursts (build output, git checkout, pnpm install) into a
// single renderer notification; the renderer re-lists the workspace on each.
const DEBOUNCE_MS = 300;

type WorkspaceFilesChangedListener = (rootPath: string) => void;

interface WorkspaceWatcherGroup {
  initialization: Promise<void>;
  watchers: Set<FSWatcher>;
}

const watcherGroups = new Map<string, WorkspaceWatcherGroup>();
const pendingFilesNotifications = new Map<string, NodeJS.Timeout>();
const pendingGitNotifications = new Map<string, NodeJS.Timeout>();
let broadcastFiles: WorkspaceFilesChangedListener | null = null;
let broadcastGitState: WorkspaceFilesChangedListener | null = null;

export function configureWorkspaceFilesChangedBroadcast(
  listener: WorkspaceFilesChangedListener,
): void {
  broadcastFiles = listener;
}

export function configureWorkspaceGitStateChangedBroadcast(
  listener: WorkspaceFilesChangedListener,
): void {
  broadcastGitState = listener;
}

// macOS reports a `change` event carrying the watched root's own basename
// alongside every descendant event; it is redundant (the descendant event
// still arrives) and would defeat the `.git` classification, so drop it.
function isRedundantRootEvent(
  rootPath: string,
  filename: string | null,
): boolean {
  return filename != null && filename === path.basename(rootPath);
}

function isGitInternalPath(filename: string): boolean {
  return filename === ".git" || filename.startsWith(`.git${path.sep}`);
}

// Git internals churn constantly (index locks, packed objects, hooks), so only
// metadata that changes visible git state notifies the renderer. Transient
// `*.lock` files are excluded because the real file's own event follows.
export function isGitStateMetadataPath(filename: string): boolean {
  const normalizedPath = filename.replaceAll("\\", "/");
  if (normalizedPath.endsWith(".lock")) {
    return false;
  }
  return (
    normalizedPath === "HEAD" ||
    normalizedPath === "index" ||
    normalizedPath === "MERGE_HEAD" ||
    normalizedPath === "ORIG_HEAD" ||
    normalizedPath === "packed-refs" ||
    normalizedPath.startsWith("refs/")
  );
}

function scheduleNotification(
  pending: Map<string, NodeJS.Timeout>,
  rootPath: string,
  notify: () => void,
): void {
  const existing = pending.get(rootPath);
  if (existing) {
    globalThis.clearTimeout(existing);
  }
  pending.set(
    rootPath,
    globalThis.setTimeout(() => {
      pending.delete(rootPath);
      notify();
    }, DEBOUNCE_MS),
  );
}

function closeWorkspaceWatcherGroup(
  rootPath: string,
  group: WorkspaceWatcherGroup,
): void {
  for (const watcher of group.watchers) {
    watcher.close();
  }
  group.watchers.clear();
  if (watcherGroups.get(rootPath) === group) {
    watcherGroups.delete(rootPath);
  }
}

function addWatcher(
  rootPath: string,
  group: WorkspaceWatcherGroup,
  watchedPath: string,
  listener: (filename: string | null) => void,
): boolean {
  try {
    const watcher = watch(
      watchedPath,
      { recursive: true },
      (_event, filename) => listener(filename),
    );
    watcher.on("error", () => closeWorkspaceWatcherGroup(rootPath, group));
    group.watchers.add(watcher);
    return true;
  } catch {
    return false;
  }
}

async function initializeWorkspaceWatcherGroup(
  rootPath: string,
  group: WorkspaceWatcherGroup,
): Promise<void> {
  addWatcher(rootPath, group, rootPath, (filename) => {
    if (isRedundantRootEvent(rootPath, filename)) {
      return;
    }
    if (filename && isGitInternalPath(filename)) {
      return;
    }
    scheduleNotification(pendingFilesNotifications, rootPath, () =>
      broadcastFiles?.(rootPath),
    );
  });

  const repositoryPaths = await resolveGitRepositoryPaths(rootPath);
  if (!repositoryPaths || watcherGroups.get(rootPath) !== group) {
    return;
  }

  const metadataDirectories = new Set([
    repositoryPaths.gitDir,
    repositoryPaths.commonDir,
  ]);
  for (const metadataDirectory of metadataDirectories) {
    addWatcher(rootPath, group, metadataDirectory, (filename) => {
      if (isRedundantRootEvent(metadataDirectory, filename)) {
        return;
      }
      if (filename && !isGitStateMetadataPath(filename)) {
        return;
      }
      scheduleNotification(pendingGitNotifications, rootPath, () =>
        broadcastGitState?.(rootPath),
      );
    });
  }
}

// Start watching a workspace root (idempotent). A repository uses one watcher
// for workspace files plus watchers for its worktree-specific git directory
// and shared refs directory. The latter two differ for linked worktrees.
export async function ensureWorkspaceFilesWatcher(
  rootPath: string,
): Promise<void> {
  const existingGroup = watcherGroups.get(rootPath);
  if (existingGroup) {
    await existingGroup.initialization;
    return;
  }

  const group: WorkspaceWatcherGroup = {
    initialization: Promise.resolve(),
    watchers: new Set(),
  };
  watcherGroups.set(rootPath, group);
  group.initialization = initializeWorkspaceWatcherGroup(rootPath, group);
  try {
    await group.initialization;
  } catch {
    closeWorkspaceWatcherGroup(rootPath, group);
    // Watching is a progressive enhancement; listing still works without it.
  }
}

export function closeAllWorkspaceFilesWatchers(): void {
  for (const pending of [pendingFilesNotifications, pendingGitNotifications]) {
    for (const timeout of pending.values()) {
      globalThis.clearTimeout(timeout);
    }
    pending.clear();
  }
  for (const [rootPath, group] of watcherGroups) {
    closeWorkspaceWatcherGroup(rootPath, group);
  }
}
