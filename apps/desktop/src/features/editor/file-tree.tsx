import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { useAtomValue, useSetAtom } from "jotai";
import { Folder, FolderOpen, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  Input,
} from "@/components/ui";
import { isPdfPath } from "@/features/pdf-reader/is-pdf-path";
import { openPdfReaderAtom } from "@/features/pdf-reader/pdf-reader-store";
import {
  activeWorkingPathAtom,
  activeWorkspaceIdAtom,
  useWorkspaceFiles,
  workspacesAtom,
} from "@/features/workspaces";
import { cn } from "@/lib/utils";
import {
  activeFileAtom,
  openFileAtom,
  openPreviewFileAtom,
} from "./editor-store";
import { FileTreeContextMenuItems } from "./file-tree-context-menu";
import {
  type FileTreeContextTarget,
  resolveFileTreeContextTarget,
} from "./file-tree-context-target";
import {
  getFileTreeRootExpanded,
  setFileTreeRootExpanded,
} from "./file-tree-expansion";
import {
  usePersistTreeExpansion,
  useSyncTreeGitStatus,
  useSyncTreePaths,
  useSyncTreeSearch,
  useSyncTreeSelection,
} from "./file-tree-sync";
import { FILE_TREE_STYLE, TREES_UNSAFE_CSS } from "./tree-style";
import {
  useLazyTreeDirectories,
  useLoadExpandedTreeDirectories,
} from "./use-lazy-tree-directories";

function entriesToPaths(
  entries: readonly { kind?: "directory" | "file"; relativePath: string }[],
): string[] {
  return entries.map((entry) =>
    entry.kind === "directory" ? `${entry.relativePath}/` : entry.relativePath,
  );
}

function findTreeRowPath(
  event: React.MouseEvent<HTMLDivElement>,
): string | undefined {
  const row = event.nativeEvent
    .composedPath()
    .find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.dataset.itemPath !== undefined,
    );
  return row?.dataset.itemPath;
}

export function FileTree() {
  const { t } = useTranslation("editor");
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const workingPath = useAtomValue(activeWorkingPathAtom);
  const activeFile = useAtomValue(activeFileAtom);
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const openFile = useSetAtom(openFileAtom);
  const openPreviewFile = useSetAtom(openPreviewFileAtom);
  const openPdfReader = useSetAtom(openPdfReaderAtom);
  const rootPath = workingPath
    ? workingPath.replace(/[\\/]+$/, "") || "/"
    : null;
  const rootFolderName = rootPath?.split(/[\\/]/).pop() || rootPath;
  const [rootExpanded, setRootExpanded] = useState(() =>
    rootPath ? getFileTreeRootExpanded(rootPath) : true,
  );
  const [rootExpandedForPath, setRootExpandedForPath] = useState(rootPath);
  if (rootPath !== rootExpandedForPath) {
    setRootExpandedForPath(rootPath);
    setRootExpanded(rootPath ? getFileTreeRootExpanded(rootPath) : true);
  }
  const handleRootToggle = useCallback(() => {
    if (!rootPath) return;
    setRootExpanded((prev) => {
      const next = !prev;
      setFileTreeRootExpanded(rootPath, next);
      return next;
    });
  }, [rootPath]);
  const workspaceFiles = useWorkspaceFiles(rootPath);
  const lazyDirectories = useLazyTreeDirectories(
    rootPath,
    workspaceFiles.files,
  );
  const filePaths = useMemo(
    () => entriesToPaths(lazyDirectories.files),
    [lazyDirectories.files],
  );

  const rootPathRef = useRef(rootPath);
  rootPathRef.current = rootPath;

  const handleSelectionChange = useCallback(
    (selectedPaths: readonly string[]) => {
      const selected = selectedPaths[0];
      if (!selected || !rootPathRef.current) return;
      if (selected.endsWith("/")) return;
      const absolutePath = `${rootPathRef.current}/${selected}`;
      if (isPdfPath(absolutePath)) {
        return;
      }
      openPreviewFile(absolutePath);
    },
    [openPreviewFile],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const root = rootPathRef.current;
      if (!root) return;
      const relativePath = findTreeRowPath(event);
      if (!relativePath || relativePath.endsWith("/")) return;
      const absolutePath = `${root}/${relativePath}`;
      if (isPdfPath(absolutePath)) {
        openPdfReader(absolutePath);
      }
    },
    [openPdfReader],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const root = rootPathRef.current;
      if (!root) return;
      const relativePath = findTreeRowPath(event);
      if (!relativePath || relativePath.endsWith("/")) return;
      const absolutePath = `${root}/${relativePath}`;
      if (isPdfPath(absolutePath)) {
        openPdfReader(absolutePath);
        return;
      }
      openFile(absolutePath);
    },
    [openFile, openPdfReader],
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTarget, setMenuTarget] = useState<FileTreeContextTarget | null>(
    null,
  );
  const menuTargetRef = useRef<FileTreeContextTarget | null>(null);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = resolveFileTreeContextTarget(findTreeRowPath(event));
      menuTargetRef.current = target;
      setMenuTarget(target);
    },
    [],
  );

  const handleMenuOpenChange = useCallback((open: boolean) => {
    if (open && !menuTargetRef.current) return;
    setMenuOpen(open);
  }, []);

  const { model } = useFileTree({
    paths: filePaths,
    initialExpansion: "closed",
    flattenEmptyDirectories: true,
    fileTreeSearchMode: "hide-non-matches",
    onSelectionChange: handleSelectionChange,
    unsafeCSS: TREES_UNSAFE_CSS,
    icons: { set: "complete", colored: true },
  });

  const isLoading = workspaceFiles.status === "loading";
  useSyncTreePaths(model, rootPath, filePaths, isLoading);
  usePersistTreeExpansion(model, rootPath, filePaths, isLoading);
  useSyncTreeSearch(model, rootPath, filePaths, isLoading, searchQuery);
  useSyncTreeSelection(model, rootPath, activeFile, filePaths, isLoading);
  useSyncTreeGitStatus(model, rootPath);
  useLoadExpandedTreeDirectories(
    model,
    filePaths,
    isLoading,
    lazyDirectories.loadDirectory,
  );

  function renderTreeBody() {
    if (!activeWorkspace) {
      return (
        <div className="px-2 py-2 text-xs text-editor-fg-muted">
          {t("states.noWorkspaceFilesDescription")}
        </div>
      );
    }
    if (workspaceFiles.status === "error") {
      return (
        <div className="px-2 py-2 text-xs text-editor-fg-muted">
          {t("states.filesLoadError")}
        </div>
      );
    }
    if (isLoading) {
      return null;
    }
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handling is delegated to PierreFileTree
      <div
        aria-label={rootFolderName ?? activeWorkspace.name}
        className="h-full"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        role="tree"
      >
        <PierreFileTree
          data-scrollbar-visible={isScrollbarVisible ? "true" : undefined}
          model={model}
          style={FILE_TREE_STYLE}
        />
      </div>
    );
  }

  const showSearch =
    activeWorkspace != null && workspaceFiles.status !== "error";

  return (
    <div
      className="flex min-h-0 flex-1 flex-col ps-2 pe-2"
      onPointerEnter={() => setIsScrollbarVisible(true)}
      onPointerLeave={() => setIsScrollbarVisible(false)}
    >
      {showSearch ? (
        <div className="shrink-0 pt-2 pb-1.5">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-editor-fg-subtle"
            />
            <Input
              aria-label={t("fileTree.search")}
              className={cn(
                "h-7 rounded-control border-editor-border bg-editor-canvas ps-7 pe-2 text-body",
                "placeholder:text-editor-fg-subtle",
              )}
              disabled={isLoading}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("fileTree.searchPlaceholder")}
              value={searchQuery}
            />
          </div>
        </div>
      ) : null}

      <ContextMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <ContextMenuTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: context menu trigger for the root row and the tree below it */}
          <div
            className="flex min-h-0 flex-1 flex-col"
            onContextMenu={handleContextMenu}
          >
            <button
              aria-expanded={rootExpanded}
              aria-label={
                rootExpanded
                  ? t("fileTree.collapseTree")
                  : t("fileTree.expandTree")
              }
              className={cn(
                "flex w-full min-w-0 shrink-0 items-center gap-0.5 rounded-control px-0.5 py-1 text-start text-body text-editor-fg",
                "hover:bg-editor-tab-hover-bg",
              )}
              data-item-path=""
              disabled={!activeWorkspace}
              onClick={handleRootToggle}
              type="button"
            >
              {rootExpanded ? (
                <FolderOpen className="size-3.5 shrink-0 text-editor-fg-subtle" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-editor-fg-subtle" />
              )}
              <span className="truncate">
                {activeWorkspace ? rootFolderName : t("states.noWorkspace")}
              </span>
            </button>

            {rootExpanded ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                {renderTreeBody()}
              </div>
            ) : null}
          </div>
        </ContextMenuTrigger>
        {menuTarget && rootPath ? (
          <ContextMenuContent className="min-w-36">
            <FileTreeContextMenuItems rootPath={rootPath} target={menuTarget} />
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
    </div>
  );
}
