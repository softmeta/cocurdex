import type { UseFileTreeResult } from "@pierre/trees/react";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceFileEntry } from "@/lib";
import { desktopApi } from "@/lib";
import {
  type LoadedDirectoryChildren,
  mergeLoadedDirectories,
  withDirectoryChildren,
} from "./file-tree-directory-entries";
import { collectExpandedDirectoryPaths } from "./file-tree-expansion";

type FileTreeModel = UseFileTreeResult["model"];

interface LoadedDirectories {
  rootPath: string;
  children: LoadedDirectoryChildren;
}

interface DirectoryRequests {
  base: readonly WorkspaceFileEntry[];
  rootPath: string | null;
  directories: Set<string>;
  latest: Map<string, number>;
}

export interface LazyTreeDirectories {
  files: readonly WorkspaceFileEntry[];
  loadDirectory(directoryPath: string): void;
}

export function useLazyTreeDirectories(
  rootPath: string | null,
  baseFiles: readonly WorkspaceFileEntry[],
): LazyTreeDirectories {
  const [loaded, setLoaded] = useState<LoadedDirectories | null>(null);
  const requestedRef = useRef<DirectoryRequests>({
    base: baseFiles,
    rootPath,
    directories: new Set(),
    latest: new Map(),
  });
  const children =
    loaded && loaded.rootPath === rootPath ? loaded.children : null;

  const requestDirectory = (
    requests: DirectoryRequests,
    directoryPath: string,
  ) => {
    if (!rootPath || requests.directories.has(directoryPath)) {
      return;
    }
    requests.directories.add(directoryPath);
    const requestId = (requests.latest.get(directoryPath) ?? 0) + 1;
    requests.latest.set(directoryPath, requestId);
    const isLatest = () =>
      requestedRef.current.rootPath === rootPath &&
      requestedRef.current.latest.get(directoryPath) === requestId;
    const update = (entries: readonly WorkspaceFileEntry[] | null) => {
      setLoaded((previous) => {
        const current =
          previous?.rootPath === rootPath ? previous.children : null;
        return {
          rootPath,
          children: withDirectoryChildren(current, directoryPath, entries),
        };
      });
    };
    const relativePath = directoryPath.replace(/\/$/, "") || ".";
    void desktopApi
      .listWorkspaceDirectory(rootPath, relativePath)
      .then((entries) => {
        if (isLatest()) update(entries);
      })
      .catch(() => {
        if (requestedRef.current.directories === requests.directories) {
          requests.directories.delete(directoryPath);
        }
        if (isLatest()) update(null);
      });
  };

  const loadDirectory = (directoryPath: string) => {
    const requested = requestedRef.current;
    if (requested.base !== baseFiles || requested.rootPath !== rootPath) {
      const sameRoot = requested.rootPath === rootPath;
      requestedRef.current = {
        base: baseFiles,
        rootPath,
        directories: new Set(),
        latest: sameRoot ? requested.latest : new Map(),
      };
      for (const loadedPath of children?.keys() ?? []) {
        requestDirectory(requestedRef.current, loadedPath);
      }
    }
    requestDirectory(requestedRef.current, directoryPath);
  };

  return {
    files: mergeLoadedDirectories(baseFiles, children),
    loadDirectory,
  };
}

export function useLoadExpandedTreeDirectories(
  model: FileTreeModel,
  filePaths: readonly string[],
  isLoading: boolean,
  loadDirectory: (directoryPath: string) => void,
) {
  const loadDirectoryRef = useRef(loadDirectory);
  loadDirectoryRef.current = loadDirectory;

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const loadExpanded = () => {
      loadDirectoryRef.current("");
      for (const directoryPath of collectExpandedDirectoryPaths(
        model,
        filePaths,
      )) {
        loadDirectoryRef.current(directoryPath);
      }
    };
    loadExpanded();
    return model.subscribe(loadExpanded);
  }, [model, filePaths, isLoading]);
}
