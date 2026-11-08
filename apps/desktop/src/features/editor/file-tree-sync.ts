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

type FileTreeModel = UseFileTreeResult["model"];

function getAncestorDirectoryPaths(filePath: string): string[] {
  const segments = filePath.split("/").slice(0, -1);
  return segments.map(
    (_, index) => `${segments.slice(0, index + 1).join("/")}/`,
  );
}

export function useSyncTreePaths(
  model: FileTreeModel,
  rootPath: string | null,
  filePaths: string[],
  isLoading: boolean,
) {
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
    if (rootPath && isLoading) {
      return;
    }

    const currentSelection = selectedPathsRef.current;

    const prefix = rootPath ? `${rootPath}/` : null;
    const targetPath =
      activeFile && prefix && activeFile.startsWith(prefix)
        ? activeFile.slice(prefix.length)
        : null;

    const alreadySynced =
      targetPath === null
        ? currentSelection.length === 0
        : currentSelection.length === 1 && currentSelection[0] === targetPath;
    if (alreadySynced) {
      return;
    }

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
