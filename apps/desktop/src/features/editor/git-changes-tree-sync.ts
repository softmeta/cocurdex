import {
  type UseFileTreeResult,
  useFileTreeSelection,
} from "@pierre/trees/react";
import { useEffect } from "react";
import { entriesToGitStatus, type GitChangeEntry } from "./git-changes-model";
import { toGitTreePath } from "./git-changes-tree-paths";

type FileTreeModel = UseFileTreeResult["model"];

// Pierre's file tree model is imperative; React props do not update its paths
// or git status after initialization, so keep that external model sync here.
// Paths are always nested under `workspaceName/` so the tree has a single
// top-level folder the user can collapse to hide every change.
//
// `searchQuery` is re-applied after every path reset: `resetPaths` rebuilds
// the store and does not reliably re-filter from a previous setSearch alone.
export function useSyncGitChangesTreeModel(
  model: FileTreeModel,
  entries: GitChangeEntry[],
  workspaceName: string,
  searchQuery: string,
) {
  useEffect(() => {
    const treePaths = entries.map((entry) =>
      toGitTreePath(workspaceName, entry.path),
    );
    model.resetPaths(treePaths);
    model.setGitStatus(
      entriesToGitStatus(entries).map((status) => ({
        ...status,
        path: toGitTreePath(workspaceName, status.path),
      })),
    );
    // null clears search and restores pre-filter expansion; a non-empty query
    // uses Pierre's default hide-non-matches mode (see trees.software/docs).
    const trimmed = searchQuery.trim();
    model.setSearch(trimmed.length > 0 ? trimmed : null);
  }, [entries, model, workspaceName, searchQuery]);
}

// Mirror the derived selected diff back into the tree so the matching row stays
// highlighted, including the initial first-file fallback. `selectedTreePath`
// is already workspace-prefixed.
export function useSyncGitChangesTreeSelection(
  model: FileTreeModel,
  selectedTreePath: string | null,
) {
  const selectedPaths = useFileTreeSelection(model);

  useEffect(() => {
    if (!selectedTreePath) {
      return;
    }
    if (selectedPaths.length === 1 && selectedPaths[0] === selectedTreePath) {
      return;
    }
    model.focusPath(selectedTreePath);
  }, [selectedTreePath, selectedPaths, model]);
}
