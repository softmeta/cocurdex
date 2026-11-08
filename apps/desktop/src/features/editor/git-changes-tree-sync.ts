import {
  type UseFileTreeResult,
  useFileTreeSelection,
} from "@pierre/trees/react";
import { type RefObject, useEffect } from "react";
import { entriesToGitStatus, type GitChangeEntry } from "./git-changes-model";
import { toGitTreePath } from "./git-changes-tree-paths";

type FileTreeModel = UseFileTreeResult["model"];

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
    const trimmed = searchQuery.trim();
    model.setSearch(trimmed.length > 0 ? trimmed : null);
  }, [entries, model, workspaceName, searchQuery]);
}

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
