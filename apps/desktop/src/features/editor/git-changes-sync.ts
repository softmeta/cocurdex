import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type {
  GitBranchInfo,
  WorkspaceGitDiffStatus,
  WorkspaceGitFileChange,
} from "@/lib";
import { desktopApi } from "@/lib";

export function useSyncWorkspaceGitChanges({
  rootPath,
  scopeKey,
  loadDiff,
  loadBranches,
  setFileChanges,
  setBranches,
  setDiffStatus,
  setIsLoading,
  setIsActionPending,
}: {
  rootPath: string | null;
  scopeKey: string;
  loadDiff(path: string, options?: { showLoading?: boolean }): Promise<void>;
  loadBranches(path: string): Promise<void>;
  setFileChanges: Dispatch<SetStateAction<WorkspaceGitFileChange[]>>;
  setBranches: Dispatch<SetStateAction<GitBranchInfo[]>>;
  setDiffStatus: Dispatch<SetStateAction<WorkspaceGitDiffStatus>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setIsActionPending: Dispatch<SetStateAction<boolean>>;
}) {
  const [syncedRootPath, setSyncedRootPath] = useState(rootPath);
  if (syncedRootPath !== rootPath) {
    setSyncedRootPath(rootPath);
    if (!rootPath) {
      setFileChanges([]);
      setBranches([]);
      setDiffStatus("ok");
      setIsLoading(false);
      setIsActionPending(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadDiff reads the scope from a ref; scopeKey is the reload trigger
  useEffect(() => {
    if (rootPath) {
      void loadDiff(rootPath);
      void loadBranches(rootPath);
    }
  }, [rootPath, scopeKey, loadDiff, loadBranches]);

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
