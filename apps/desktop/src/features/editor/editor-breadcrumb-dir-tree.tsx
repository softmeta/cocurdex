import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import { isPdfPath } from "@/features/pdf-reader/is-pdf-path";
import { openPdfReaderAtom } from "@/features/pdf-reader/pdf-reader-store";
import { desktopApi, useMountEffect } from "@/lib";
import {
  BREADCRUMB_TREE_HOST_CLASS,
  getSubtreePaths,
  resolveBreadcrumbSelectedFilePath,
} from "./editor-breadcrumb-dir-tree-utils";
import { openPreviewFileAtom } from "./editor-store";
import { TREE_STYLE, TREES_UNSAFE_CSS } from "./tree-style";

export interface BreadcrumbDirTreeProps {
  rootPath: string;
  dirPath: string;
  selectedPath: string;
  onPicked: () => void;
}

export function BreadcrumbDirTree({
  rootPath,
  dirPath,
  selectedPath,
  onPicked,
}: BreadcrumbDirTreeProps) {
  return (
    <BreadcrumbDirTreeLoader
      dirPath={dirPath}
      key={`${rootPath}\0${dirPath}\0${selectedPath}`}
      onPicked={onPicked}
      rootPath={rootPath}
      selectedPath={selectedPath}
    />
  );
}

function BreadcrumbDirTreeLoader(props: BreadcrumbDirTreeProps) {
  const [paths, setPaths] = useState<string[] | null>(null);

  useMountEffect(() => {
    let isActive = true;
    void desktopApi
      .listWorkspaceFiles(props.rootPath)
      .then((entries) => {
        if (isActive) setPaths(getSubtreePaths(entries, props.dirPath));
      })
      .catch(() => {
        if (isActive) setPaths([]);
      });
    return () => {
      isActive = false;
    };
  });

  if (!paths) return <div className={BREADCRUMB_TREE_HOST_CLASS} />;
  return <BreadcrumbDirTreeContent {...props} paths={paths} />;
}

function BreadcrumbDirTreeContent({
  rootPath,
  dirPath,
  selectedPath,
  onPicked,
  paths,
}: BreadcrumbDirTreeProps & { paths: string[] }) {
  const openPreviewFile = useSetAtom(openPreviewFileAtom);
  const openPdfReader = useSetAtom(openPdfReaderAtom);
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);

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
    paths,
    initialSelectedPaths: [selectedPath],
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

  return (
    <div
      className={BREADCRUMB_TREE_HOST_CLASS}
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
