import {
  type UseFileTreeResult,
  useFileTreeSelection,
} from "@pierre/trees/react";
import { type RefObject, useEffect } from "react";
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

// Mirror the derived selected diff back into the tree: the row the reader has
// scrolled to has to be the tree's selection, not just its focus, because the
// highlight the reader sees is the selection. `selectedTreePath` is already
// workspace-prefixed.
//
// Pierre scrolls its own viewport only when the tree owns DOM focus, so the
// index would stop following the diff stack while the reader scrolls it. Bring
// the row in ourselves; it is normally mounted already, because following the
// reader moves the target by a row or two at a time.
function revealRow(model: FileTreeModel, treePath: string): void {
  const rows = model
    .getFileTreeContainer()
    ?.shadowRoot?.querySelectorAll<HTMLElement>("[data-item-path]");
  for (const row of rows ?? []) {
    if (row.dataset.itemPath !== treePath) continue;
    row.scrollIntoView({ block: "nearest" });
    return;
  }
}

// The public model only offers per-item selection, so selecting exactly one row
// means dropping the other selected rows first.
function selectOnlyRow(model: FileTreeModel, treePath: string): void {
  for (const path of model.getSelectedPaths()) {
    if (path !== treePath) model.getItem(path)?.deselect();
  }
  const item = model.getItem(treePath);
  if (item !== null && !item.isSelected()) item.select();
  if (model.getFocusedPath() !== treePath) model.focusPath(treePath);
}

export function useSyncGitChangesTreeSelection(
  model: FileTreeModel,
  selectedTreePath: string | null,
  programmaticSelectionRef?: RefObject<boolean>,
) {
  const selectedPaths = useFileTreeSelection(model);

  useEffect(() => {
    if (!selectedTreePath) {
      return;
    }
    const alreadySelected =
      selectedPaths.length === 1 && selectedPaths[0] === selectedTreePath;
    if (!alreadySelected) {
      // Pierre notifies selection changes synchronously, so the row it is
      // selecting on the stack's behalf is silenced before it reaches the
      // reader as a click.
      const ref = programmaticSelectionRef;
      if (ref) ref.current = true;
      try {
        selectOnlyRow(model, selectedTreePath);
      } finally {
        if (ref) ref.current = false;
      }
    }
    revealRow(model, selectedTreePath);
  }, [selectedTreePath, selectedPaths, model, programmaticSelectionRef]);
}
