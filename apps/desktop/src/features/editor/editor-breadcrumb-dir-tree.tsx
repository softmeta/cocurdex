import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
// Imported from leaf modules rather than the pdf-reader barrel for the same
// reason as file-tree.tsx: the barrel pulls in PdfViewer, which imports the
// editor barrel, forming an editor ↔ pdf-reader cycle.
import { isPdfPath } from "@/features/pdf-reader/is-pdf-path";
import { openPdfReaderAtom } from "@/features/pdf-reader/pdf-reader-store";
import { desktopApi, useMountEffect } from "@/lib";
import {
  getSubtreePaths,
  resolveBreadcrumbSelectedFilePath,
} from "./editor-breadcrumb-dir-tree-utils";
import { openPreviewFileAtom } from "./editor-store";
import { TREE_STYLE, TREES_UNSAFE_CSS } from "./tree-style";

export interface BreadcrumbDirTreeProps {
  rootPath: string;
  // Workspace-relative directory the tree is rooted at ("" = workspace root).
  dirPath: string;
  selectedPath: string;
  // Called once a file is picked so the host can close its popover.
  onPicked: () => void;
}

// A lightweight, self-contained @pierre/trees view rendered inside the
// breadcrumb popover. Unlike the panel's FileTree it owns no selection sync,
// context menu, or double-click pinning — selecting a file opens it in the
// preview tab and dismisses the popover; directory selection is ignored so
// Pierre's own expand/collapse behavior can handle it.
export function BreadcrumbDirTree({
  rootPath,
  dirPath,
  selectedPath,
  onPicked,
}: BreadcrumbDirTreeProps) {
  return (
    <BreadcrumbDirTreeContent
      dirPath={dirPath}
      key={`${rootPath}\0${dirPath}\0${selectedPath}`}
      onPicked={onPicked}
      rootPath={rootPath}
      selectedPath={selectedPath}
    />
  );
}

function BreadcrumbDirTreeContent({
  rootPath,
  dirPath,
  selectedPath,
  onPicked,
}: BreadcrumbDirTreeProps) {
  const openPreviewFile = useSetAtom(openPreviewFileAtom);
  const openPdfReader = useSetAtom(openPdfReaderAtom);
  // Same quiet scrollbar host pattern as FileTree / GitChangesTree.
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);

  // Keep latest values reachable from the click handler without rebuilding
  // the tree model; useFileTree options are not a controlled update path.
  const callbackRefs = useRef({
    rootPath,
    dirPath,
    onPicked,
    openPreviewFile,
    openPdfReader,
  });
  callbackRefs.current = {
    rootPath,
    dirPath,
    onPicked,
    openPreviewFile,
    openPdfReader,
  };

  const { model } = useFileTree({
    paths: [],
    initialExpansion: "closed",
    flattenEmptyDirectories: true,
    unsafeCSS: TREES_UNSAFE_CSS,
    icons: { set: "complete", colored: true },
  });

  const handleClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const row = event.nativeEvent
        .composedPath()
        .find(
          (node): node is HTMLElement =>
            node instanceof HTMLElement && node.dataset.itemPath !== undefined,
        );
      if (row?.dataset.itemType !== "file") return;

      const refs = callbackRefs.current;
      const absolutePath = resolveBreadcrumbSelectedFilePath(
        refs.rootPath,
        refs.dirPath,
        row.dataset.itemPath ?? "",
      );
      if (!absolutePath) return;

      if (isPdfPath(absolutePath)) {
        refs.openPdfReader(absolutePath);
      } else {
        refs.openPreviewFile(absolutePath);
      }
      refs.onPicked();
    },
    [],
  );

  useMountEffect(() => {
    let isActive = true;
    void desktopApi
      .listWorkspaceFiles(rootPath)
      .then((entries) => {
        if (!isActive) return;
        model.resetPaths(getSubtreePaths(entries, dirPath));
        const selectedItem = model.getItem(selectedPath);
        selectedItem?.select();
      })
      .catch(() => {
        if (!isActive) return;
        model.resetPaths([]);
      });
    return () => {
      isActive = false;
    };
  });

  return (
    // TREE_STYLE sets height:100%, and Pierre virtualizes rows — without a
    // resolved height the list renders zero rows. A fixed height gives it one.
    // ponytail: fixed 18rem; measure content to size-to-fit if the blank space
    // under small directories becomes annoying.
    <div
      className="h-72 w-64 overflow-hidden"
      onClickCapture={handleClickCapture}
      onPointerEnter={() => setIsScrollbarVisible(true)}
      onPointerLeave={() => setIsScrollbarVisible(false)}
    >
      <PierreFileTree
        data-scrollbar-visible={isScrollbarVisible ? "true" : undefined}
        model={model}
        style={TREE_STYLE}
      />
    </div>
  );
}
