import {
  type Dispatch,
  type SetStateAction,
  startTransition,
  useEffect,
  useRef,
} from "react";
import type {
  GitBranchInfo,
  WorkspaceGitDiffStatus,
  WorkspaceGitFileChange,
} from "@/lib";
import { desktopApi } from "@/lib";
import { type GitViewMode, resolveViewModeOnResize } from "./git-view-mode";

export function useGitChangesAutoViewMode(
  isRightPanelResizing: boolean,
  setManualViewMode: Dispatch<SetStateAction<GitViewMode | null>>,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isRightPanelResizingRef = useRef(isRightPanelResizing);
  isRightPanelResizingRef.current = isRightPanelResizing;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver((observed) => {
      const entry = observed[0];
      if (!entry) {
        return;
      }
      const width = entry.contentRect.width;
      startTransition(() => {
        setManualViewMode((current) =>
          resolveViewModeOnResize({
            current,
            width,
            isUserResizing: isRightPanelResizingRef.current,
          }),
        );
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [setManualViewMode]);

  return containerRef;
}

export function useSyncWorkspaceGitChanges({
  rootPath,
  loadDiff,
  loadBranches,
  setFileChanges,
  setBranches,
  setDiffStatus,
  setIsLoading,
  setIsActionPending,
}: {
  rootPath: string | null;
  loadDiff(path: string, options?: { showLoading?: boolean }): Promise<void>;
  loadBranches(path: string): Promise<void>;
  setFileChanges: Dispatch<SetStateAction<WorkspaceGitFileChange[]>>;
  setBranches: Dispatch<SetStateAction<GitBranchInfo[]>>;
  setDiffStatus: Dispatch<SetStateAction<WorkspaceGitDiffStatus>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setIsActionPending: Dispatch<SetStateAction<boolean>>;
}) {
  useEffect(() => {
    if (!rootPath) {
      setFileChanges([]);
      setBranches([]);
      setDiffStatus("ok");
      setIsLoading(false);
      setIsActionPending(false);
      return;
    }
    void loadDiff(rootPath);
    void loadBranches(rootPath);
  }, [
    rootPath,
    loadDiff,
    loadBranches,
    setFileChanges,
    setBranches,
    setDiffStatus,
    setIsLoading,
    setIsActionPending,
  ]);

  // External system sync: the main process pushes debounced notifications for
  // worktree edits (files-changed) and git metadata updates such as commits,
  // stages, or branch switches done outside the app (git-state-changed).
  // Reload silently so the panel refreshes in place without a loading flash.
  useEffect(() => {
    if (!rootPath) {
      return;
    }
    const reload = (event: { rootPath: string }) => {
      if (event.rootPath !== rootPath) {
        return;
      }
      void loadDiff(rootPath, { showLoading: false });
      void loadBranches(rootPath);
    };
    const unsubscribeFiles = desktopApi.onWorkspaceFilesChanged(reload);
    const unsubscribeGit = desktopApi.onWorkspaceGitStateChanged(reload);
    return () => {
      unsubscribeFiles();
      unsubscribeGit();
    };
  }, [rootPath, loadDiff, loadBranches]);
}
