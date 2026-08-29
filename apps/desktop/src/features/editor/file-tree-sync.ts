import {
  type UseFileTreeResult,
  useFileTreeSelection,
} from "@pierre/trees/react";
import { useEffect, useRef } from "react";
import type { WorkspaceGitStatusEntry } from "@/lib";
import { desktopApi } from "@/lib";
import {
  collectExpandedDirectoryPaths,
  getFileTreeExpandedPaths,
  resolveExpandedPathsForReset,
  setFileTreeExpandedPaths,
} from "./file-tree-expansion";

// Pierre's tree model is an external, imperative store (not React state):
// `useFileTree` reads `paths` only at init, and selection/expansion are driven
// by method calls. Pushing React data into it is therefore a genuine
// external-system sync — the one sanctioned `useEffect` seam — so it lives in
// these custom hooks instead of the component body.

type FileTreeModel = UseFileTreeResult["model"];

function getAncestorDirectoryPaths(filePath: string): string[] {
  const segments = filePath.split("/").slice(0, -1);
  return segments.map(
    (_, index) => `${segments.slice(0, index + 1).join("/")}/`,
  );
}

// Mirror the active workspace's file paths into the tree model. Clears to empty
// when there is no workspace, and waits out the loading state so a stale listing
// is never flashed. `resetPaths` rebuilds the store and drops expansion unless
// we re-supply it — restore live (path refresh) or session-cached (remount).
export function useSyncTreePaths(
  model: FileTreeModel,
  rootPath: string | null,
  filePaths: string[],
  isLoading: boolean,
) {
  // Paths present on the model before this effect's last reset, so a refresh
  // can snapshot expansion from the live tree instead of only the session cache.
  const knownPathsRef = useRef<readonly string[]>([]);

  useEffect(() => {
    if (!rootPath) {
      model.resetPaths([]);
      model.setSearch(null);
      knownPathsRef.current = [];
      return;
    }
    if (isLoading) {
      return;
    }
    const liveExpanded = collectExpandedDirectoryPaths(
      model,
      knownPathsRef.current,
    );
    const storedExpanded = getFileTreeExpandedPaths(rootPath);
    const initialExpandedPaths = resolveExpandedPathsForReset(
      liveExpanded,
      storedExpanded,
    );
    if (initialExpandedPaths != null) {
      setFileTreeExpandedPaths(rootPath, initialExpandedPaths);
    }
    model.resetPaths(filePaths, {
      initialExpandedPaths,
    });
    knownPathsRef.current = filePaths;
  }, [model, rootPath, filePaths, isLoading]);
}

// Keep the session expansion cache in lockstep with user expand/collapse (and
// flush once more on unmount so a tab switch still remembers the last shape).
export function usePersistTreeExpansion(
  model: FileTreeModel,
  rootPath: string | null,
  filePaths: string[],
  isLoading: boolean,
) {
  useEffect(() => {
    if (!rootPath || isLoading) {
      return;
    }

    const persist = () => {
      setFileTreeExpandedPaths(
        rootPath,
        collectExpandedDirectoryPaths(model, filePaths),
      );
    };

    persist();
    const unsubscribe = model.subscribe(persist);
    return () => {
      persist();
      unsubscribe();
    };
  }, [model, rootPath, filePaths, isLoading]);
}

// Drive Pierre's hide-non-matches filter from an external search field. Re-applies
// after path rebuilds: `resetPaths` does not keep a prior `setSearch` filter.
export function useSyncTreeSearch(
  model: FileTreeModel,
  rootPath: string | null,
  filePaths: string[],
  isLoading: boolean,
  searchQuery: string,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `filePaths` re-triggers after useSyncTreePaths rebuilds the model so the active query is reapplied
  useEffect(() => {
    if (!rootPath || isLoading) {
      return;
    }
    const trimmed = searchQuery.trim();
    model.setSearch(trimmed.length > 0 ? trimmed : null);
  }, [model, rootPath, filePaths, isLoading, searchQuery]);
}

// Mirror the externally-driven active file into the tree's selection so exactly
// its row is highlighted (even when opened via a tab or code navigation), and
// cleared once every tab is closed.
//
// Depends on `filePaths` so it re-applies after `useSyncTreePaths` rebuilds the
// model's items — replacing the old revision-counter relay between the two
// effects. The live selection is read through a ref so the effect does NOT
// depend on it: collapsing a directory is a Pierre selection change, and
// re-running on it would forcibly re-expand the active file's ancestors, making
// folders impossible to collapse.
export function useSyncTreeSelection(
  model: FileTreeModel,
  rootPath: string | null,
  activeFile: string | null,
  filePaths: string[],
  isLoading: boolean,
) {
  const selectedPaths = useFileTreeSelection(model);
  const selectedPathsRef = useRef(selectedPaths);
  selectedPathsRef.current = selectedPaths;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `filePaths` is an intentional re-run trigger — selection must re-apply after useSyncTreePaths rebuilds the model's items
  useEffect(() => {
    // Wait until the paths sync has run at least once. With a root that means
    // waiting out loading; with no root the model was already reset to empty.
    if (rootPath && isLoading) {
      return;
    }

    const currentSelection = selectedPathsRef.current;

    // Relative tree key for the active file, or null when nothing is open or
    // the active file lives outside this workspace root.
    const prefix = rootPath ? `${rootPath}/` : null;
    const targetPath =
      activeFile && prefix && activeFile.startsWith(prefix)
        ? activeFile.slice(prefix.length)
        : null;

    // Already in the desired single/empty selection state — nothing to do.
    const alreadySynced =
      targetPath === null
        ? currentSelection.length === 0
        : currentSelection.length === 1 && currentSelection[0] === targetPath;
    if (alreadySynced) {
      return;
    }

    // `item.select()` is additive, so stale rows linger unless deselected.
    // This also clears the highlight when targetPath is null (all tabs closed).
    for (const path of currentSelection) {
      if (path === targetPath) {
        continue;
      }
      model.getItem(path)?.deselect();
    }

    if (!targetPath) {
      return;
    }

    for (const directoryPath of getAncestorDirectoryPaths(targetPath)) {
      const item = model.getItem(directoryPath);
      if (item?.isDirectory() && "expand" in item) {
        item.expand();
      }
    }

    const item = model.getItem(targetPath);
    if (item) {
      item.select();
      item.focus();
      return;
    }

    model.focusPath(targetPath);
  }, [model, rootPath, activeFile, filePaths, isLoading]);
}

// Push working-tree git badges into Pierre's built-in status lane. Status is
// independent of the path listing (folders with changed descendants light up
// even when a deleted path is not in the tree). Reloads on files-changed and
// git-state-changed so external edits stay in sync without a loading flash.
export function useSyncTreeGitStatus(
  model: FileTreeModel,
  rootPath: string | null,
) {
  useEffect(() => {
    if (!rootPath) {
      model.setGitStatus(undefined);
      return;
    }

    let cancelled = false;
    let requestSeq = 0;

    const applyEntries = (entries: WorkspaceGitStatusEntry[]) => {
      // Paths are already workspace-relative and match file-tree identity.
      model.setGitStatus(entries);
    };

    const loadStatus = async () => {
      const seq = ++requestSeq;
      try {
        const result = await desktopApi.getWorkspaceGitStatus(rootPath);
        if (cancelled || seq !== requestSeq) return;
        if (result.status !== "ok") {
          applyEntries([]);
          return;
        }
        applyEntries(result.entries);
      } catch {
        if (cancelled || seq !== requestSeq) return;
        applyEntries([]);
      }
    };

    void loadStatus();

    const reload = (event: { rootPath: string }) => {
      if (event.rootPath !== rootPath) return;
      void loadStatus();
    };
    const unsubscribeFiles = desktopApi.onWorkspaceFilesChanged(reload);
    const unsubscribeGit = desktopApi.onWorkspaceGitStateChanged(reload);

    return () => {
      cancelled = true;
      unsubscribeFiles();
      unsubscribeGit();
      model.setGitStatus(undefined);
    };
  }, [model, rootPath]);
}
