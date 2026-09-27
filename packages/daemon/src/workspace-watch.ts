import { type FSWatcher, watch } from "node:fs";
import path from "node:path";
import type { WorkspaceWatchDaemonEvent } from "@cocurdex/shared";
import { resolveGitRepositoryPaths } from "./git/git-client";

// Coalesce fs event bursts (build output, git checkout, pnpm install) into a
// single notification; clients re-list the workspace on each.
const DEBOUNCE_MS = 300;

interface WatcherGroup {
  initialization: Promise<void>;
  watchers: Set<FSWatcher>;
}

// macOS reports a `change` event carrying the watched root's own basename
// alongside every descendant event; it is redundant (the descendant event
// still arrives) and would defeat the `.git` classification, so drop it.
function isRedundantRootEvent(rootPath: string, filename: string | null) {
  return filename != null && filename === path.basename(rootPath);
}

function isGitInternalPath(filename: string) {
  return filename === ".git" || filename.startsWith(`.git${path.sep}`);
}

// Git internals churn constantly (index locks, packed objects, hooks), so only
// metadata that changes visible git state notifies clients. Transient `*.lock`
// files are excluded because the real file's own event follows.
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

export class WorkspaceWatchService {
  private readonly groups = new Map<string, WatcherGroup>();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private closed = false;

  constructor(
    private readonly broadcast: (event: WorkspaceWatchDaemonEvent) => void,
  ) {}

  // Idempotent. A repository uses one watcher for workspace files plus
  // watchers for its worktree-specific git directory and shared refs
  // directory; the latter two differ for linked worktrees. Watching is a
  // progressive enhancement, so failures are swallowed.
  async ensure(rootPath: string): Promise<void> {
    if (this.closed) {
      return;
    }
    const existing = this.groups.get(rootPath);
    if (existing) {
      await existing.initialization;
      return;
    }
    const group: WatcherGroup = {
      initialization: Promise.resolve(),
      watchers: new Set(),
    };
    this.groups.set(rootPath, group);
    group.initialization = this.initialize(rootPath, group);
    try {
      await group.initialization;
    } catch {
      this.closeGroup(rootPath, group);
    }
  }

  close(): void {
    this.closed = true;
    for (const timeout of this.pending.values()) {
      globalThis.clearTimeout(timeout);
    }
    this.pending.clear();
    for (const [rootPath, group] of this.groups) {
      this.closeGroup(rootPath, group);
    }
  }

  private async initialize(rootPath: string, group: WatcherGroup) {
    this.addWatcher(rootPath, group, rootPath, (filename) => {
      if (isRedundantRootEvent(rootPath, filename)) {
        return;
      }
      if (filename && isGitInternalPath(filename)) {
        return;
      }
      this.schedule({ type: "workspace.filesChanged", rootPath });
    });

    const repositoryPaths = await resolveGitRepositoryPaths(rootPath);
    if (!repositoryPaths || this.groups.get(rootPath) !== group) {
      return;
    }
    const metadataDirectories = new Set([
      repositoryPaths.gitDir,
      repositoryPaths.commonDir,
    ]);
    for (const metadataDirectory of metadataDirectories) {
      this.addWatcher(rootPath, group, metadataDirectory, (filename) => {
        if (isRedundantRootEvent(metadataDirectory, filename)) {
          return;
        }
        if (filename && !isGitStateMetadataPath(filename)) {
          return;
        }
        this.schedule({ type: "workspace.gitStateChanged", rootPath });
      });
    }
  }

  private addWatcher(
    rootPath: string,
    group: WatcherGroup,
    watchedPath: string,
    listener: (filename: string | null) => void,
  ) {
    try {
      const watcher = watch(
        watchedPath,
        { recursive: true },
        (_event, filename) => listener(filename),
      );
      watcher.on("error", () => this.closeGroup(rootPath, group));
      group.watchers.add(watcher);
    } catch {
      return;
    }
  }

  private schedule(event: WorkspaceWatchDaemonEvent) {
    const key = `${event.type}\0${event.rootPath}`;
    const existing = this.pending.get(key);
    if (existing) {
      globalThis.clearTimeout(existing);
    }
    this.pending.set(
      key,
      globalThis.setTimeout(() => {
        this.pending.delete(key);
        this.broadcast(event);
      }, DEBOUNCE_MS),
    );
  }

  private closeGroup(rootPath: string, group: WatcherGroup) {
    for (const watcher of group.watchers) {
      watcher.close();
    }
    group.watchers.clear();
    if (this.groups.get(rootPath) === group) {
      this.groups.delete(rootPath);
    }
  }
}
