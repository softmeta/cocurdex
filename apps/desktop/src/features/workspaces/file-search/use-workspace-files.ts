import { useEffect, useState } from "react";
import type { WorkspaceFileEntry } from "@/lib";
import { desktopApi } from "@/lib";

export type WorkspaceFilesStatus = "idle" | "loading" | "error";

export interface WorkspaceFilesState {
  files: WorkspaceFileEntry[];
  status: WorkspaceFilesStatus;
}

interface CacheEntry {
  files: WorkspaceFileEntry[];
  loadedAt: number;
}

// Module-level cache so multiple consumers (search palette, @-mention, file
// tree) share a single `listWorkspaceFiles` result per workspace root. The
// desktop main process already has its own fd-backed cache; this layer just
// spares the IPC round-trip and the flash of loading state when the popup
// reopens. Entries are invalidated by main-process files-changed pushes.
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<WorkspaceFileEntry[]>>();

// Mounted hooks per root; files-changed pushes and load results fan out here.
type WorkspaceFilesListener = (state: WorkspaceFilesState) => void;
const consumers = new Map<string, Set<WorkspaceFilesListener>>();
let changeSubscription: (() => void) | null = null;

function emit(rootPath: string, state: WorkspaceFilesState) {
  const listeners = consumers.get(rootPath);
  if (!listeners) return;
  for (const listener of listeners) {
    listener(state);
  }
}

async function loadWorkspaceFiles(
  rootPath: string,
): Promise<WorkspaceFileEntry[]> {
  const existing = inflight.get(rootPath);
  if (existing) {
    return existing;
  }
  const promise = desktopApi
    .listWorkspaceFiles(rootPath)
    .then((files) => {
      // A files-changed push may have superseded this request while it was in
      // flight; only the current request may write the cache.
      if (inflight.get(rootPath) === promise) {
        cache.set(rootPath, { files, loadedAt: Date.now() });
      }
      return files;
    })
    .finally(() => {
      if (inflight.get(rootPath) === promise) {
        inflight.delete(rootPath);
      }
    });
  inflight.set(rootPath, promise);
  return promise;
}

// Load (or reuse in-flight load) and fan the result out to every mounted
// consumer of the root. Errors surface as an explicit error state.
async function primeWorkspaceFiles(rootPath: string) {
  try {
    const files = await loadWorkspaceFiles(rootPath);
    if (cache.get(rootPath)?.files !== files) {
      return;
    }
    emit(rootPath, { files, status: "idle" });
  } catch {
    if (inflight.has(rootPath)) {
      return;
    }
    emit(rootPath, {
      files: cache.get(rootPath)?.files ?? [],
      status: "error",
    });
  }
}

// Lazily attach the single files-changed subscription. On a push, mounted roots
// silently re-fetch while the cached list stays visible as the last-good value.
function ensureChangeSubscription() {
  if (changeSubscription) return;
  // Partial test mocks of desktopApi may omit the event bridge; without it the
  // tree simply doesn't auto-refresh.
  if (typeof desktopApi.onWorkspaceFilesChanged !== "function") return;
  changeSubscription = desktopApi.onWorkspaceFilesChanged(({ rootPath }) => {
    inflight.delete(rootPath);
    if (consumers.get(rootPath)?.size) {
      void primeWorkspaceFiles(rootPath);
    }
  });
}

export function invalidateWorkspaceFilesCache(rootPath?: string) {
  if (rootPath) {
    cache.delete(rootPath);
    inflight.delete(rootPath);
    return;
  }
  cache.clear();
  inflight.clear();
}

export function useWorkspaceFiles(
  rootPath: string | null | undefined,
): WorkspaceFilesState {
  const cached = rootPath ? cache.get(rootPath) : undefined;
  const [state, setState] = useState<WorkspaceFilesState>(() => {
    if (!rootPath) {
      return { files: [], status: "idle" };
    }
    if (cached) {
      return { files: cached.files, status: "idle" };
    }
    return { files: [], status: "loading" };
  });

  useEffect(() => {
    if (!rootPath) {
      setState({ files: [], status: "idle" });
      return;
    }

    ensureChangeSubscription();
    let listeners = consumers.get(rootPath);
    if (!listeners) {
      listeners = new Set();
      consumers.set(rootPath, listeners);
    }
    listeners.add(setState);

    const hit = cache.get(rootPath);
    if (hit) {
      setState({ files: hit.files, status: "idle" });
    } else {
      setState({ files: [], status: "loading" });
      void primeWorkspaceFiles(rootPath);
    }

    return () => {
      listeners.delete(setState);
      if (listeners.size === 0) {
        consumers.delete(rootPath);
      }
    };
  }, [rootPath]);

  return state;
}
