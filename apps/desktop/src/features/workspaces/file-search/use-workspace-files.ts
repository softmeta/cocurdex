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

function initialMergedState(roots: string[]): WorkspaceFilesState {
  if (roots.length === 0) {
    return { files: [], status: "idle" };
  }
  const files = roots.flatMap((root) => cache.get(root)?.files ?? []);
  const status = roots.every((root) => cache.has(root)) ? "idle" : "loading";
  return { files, status };
}

export function useWorkspaceFiles(
  input: string | readonly string[] | null | undefined,
): WorkspaceFilesState {
  const rootsKey = typeof input === "string" ? input : (input ?? []).join("\n");
  const [state, setState] = useState<WorkspaceFilesState>(() =>
    initialMergedState(rootsKey ? rootsKey.split("\n") : []),
  );

  useEffect(() => {
    const roots = rootsKey ? rootsKey.split("\n") : [];
    if (roots.length === 0) {
      setState({ files: [], status: "idle" });
      return;
    }

    ensureChangeSubscription();
    const latest = new Map<string, WorkspaceFilesState>();
    const publish = () => {
      const files = roots.flatMap((root) => latest.get(root)?.files ?? []);
      const statuses = roots.map(
        (root) => latest.get(root)?.status ?? "loading",
      );
      setState({
        files,
        status: statuses.includes("loading")
          ? "loading"
          : statuses.includes("error")
            ? "error"
            : "idle",
      });
    };
    const attached: Array<[string, WorkspaceFilesListener]> = [];

    for (const root of roots) {
      let listeners = consumers.get(root);
      if (!listeners) {
        listeners = new Set();
        consumers.set(root, listeners);
      }
      const listener: WorkspaceFilesListener = (next) => {
        latest.set(root, next);
        publish();
      };
      listeners.add(listener);
      attached.push([root, listener]);

      const hit = cache.get(root);
      if (hit) {
        latest.set(root, { files: hit.files, status: "idle" });
      } else {
        latest.set(root, { files: [], status: "loading" });
        void primeWorkspaceFiles(root);
      }
    }
    publish();

    return () => {
      for (const [root, listener] of attached) {
        const listeners = consumers.get(root);
        listeners?.delete(listener);
        if (listeners?.size === 0) {
          consumers.delete(root);
        }
      }
    };
  }, [rootsKey]);

  return state;
}
