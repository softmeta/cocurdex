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
  Spinner,
} from "@/components/ui";
// Imported from leaf modules rather than the pdf-reader barrel: the barrel also
// exports PdfViewer, which imports the editor barrel — pulling it from here
// would form an editor ↔ pdf-reader barrel cycle. These leaves have no such edge.
import { isPdfPath } from "@/features/pdf-reader/is-pdf-path";
import { openPdfReaderAtom } from "@/features/pdf-reader/pdf-reader-store";
import {
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
import {
  FileTreeContextMenuItems,
  type FileTreeContextTarget,
} from "./file-tree-context-menu";
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

/**
 * Convert flat file entries into the path list that `@pierre/trees` expects.
 * Directory entries are marked with a trailing slash — the library's explicit
 * directory syntax — so empty directories render too (inference from file
 * paths alone would drop them).
 */
function entriesToPaths(
  entries: { kind?: "directory" | "file"; relativePath: string }[],
): string[] {
  return entries.map((entry) =>
    entry.kind === "directory" ? `${entry.relativePath}/` : entry.relativePath,
  );
}

// Pierre renders rows inside a shadow root and exposes no row events, so walk
// the event's composed path to find the row element and read the relative path
// attribute it carries. Returns undefined when the event missed every row.
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
  const activeFile = useAtomValue(activeFileAtom);
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const openFile = useSetAtom(openFileAtom);
  const openPreviewFile = useSetAtom(openPreviewFileAtom);
  const openPdfReader = useSetAtom(openPdfReaderAtom);
  // Strip trailing separators so `${rootPath}/${relativePath}` joins never
  // produce double slashes (which would break tab dedup and selection sync).
  const rootPath = activeWorkspace
    ? activeWorkspace.rootPath.replace(/[\\/]+$/, "") || "/"
    : null;
  // Synthetic workspace root row (outside Pierre). Open by default; session-
  // keyed so tab remounts keep the last open/closed choice. Adjust state when
  // the workspace root changes (React-recommended props→state sync).
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
  const filePaths = useMemo(
    () => entriesToPaths(workspaceFiles.files),
    [workspaceFiles.files],
  );

  // Keep a ref so the selection-change callback always sees the latest rootPath
  // without recreating the closure (which would require a new model).
  const rootPathRef = useRef(rootPath);
  rootPathRef.current = rootPath;

  // Single click selects a row: open it in the transient preview tab so casual
  // browsing reuses one slot instead of piling up tabs.
  const handleSelectionChange = useCallback(
    (selectedPaths: readonly string[]) => {
      const selected = selectedPaths[0];
      if (!selected || !rootPathRef.current) return;
      // Skip directories (paths ending with /)
      if (selected.endsWith("/")) return;
      // Build the absolute path from rootPath + relative selection
      const absolutePath = `${rootPathRef.current}/${selected}`;
      // PDFs open in the dedicated reader, but only on a deliberate click (see
      // handleClick). Selection-change also fires when the tree restores a
      // previously selected row (e.g. focusing the tree tab with one file), and
      // auto-jumping the panel on that would be jarring — so do nothing here.
      if (isPdfPath(absolutePath)) {
        return;
      }
      openPreviewFile(absolutePath);
    },
    [openPreviewFile],
  );

  // Open the PDF reader only on a genuine pointer click of a PDF row. A DOM
  // click never fires from programmatic selection restore, so this avoids the
  // auto-jump while still reacting to a real user click.
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

  // Double click pins the file as a permanent tab. Pierre exposes no activate
  // event, so resolve the clicked row from the composed path.
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const root = rootPathRef.current;
      if (!root) return;
      const relativePath = findTreeRowPath(event);
      // Directories carry a trailing slash; only files are pinnable.
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

  // Right click opens the row's context menu. The target is captured from the
  // composed path before the menu opens; right-clicks that miss every row are
  // suppressed via the open guard below so no empty menu appears.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTarget, setMenuTarget] = useState<FileTreeContextTarget | null>(
    null,
  );
  const menuTargetRef = useRef<FileTreeContextTarget | null>(null);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const relativePath = findTreeRowPath(event);
      const target = relativePath
        ? { relativePath, isDirectory: relativePath.endsWith("/") }
        : null;
      // Ref drives the synchronous open guard; state drives menu rendering.
      menuTargetRef.current = target;
      setMenuTarget(target);
    },
    [],
  );

  // Keep the menu closed when the right-click landed on empty tree space.
  const handleMenuOpenChange = useCallback((open: boolean) => {
    if (open && !menuTargetRef.current) return;
    setMenuOpen(open);
  }, []);

  const { model } = useFileTree({
    paths: filePaths,
    initialExpansion: "closed",
    flattenEmptyDirectories: true,
    // Filter via model.setSearch from the external input (hide-non-matches).
    // Keep Pierre's built-in search chrome off so we own layout and i18n.
    fileTreeSearchMode: "hide-non-matches",
    onSelectionChange: handleSelectionChange,
    unsafeCSS: TREES_UNSAFE_CSS,
    // Keep Pierre's `complete` brand-aware icon set — explicit for clarity.
    icons: { set: "complete", colored: true },
  });

  // Push workspace paths, search filter, active-file selection, expansion
  // memory, and git badges into Pierre's imperative model. All are
  // external-system syncs; effects live in these hooks.
  const isLoading = workspaceFiles.status === "loading";
  useSyncTreePaths(model, rootPath, filePaths, isLoading);
  usePersistTreeExpansion(model, rootPath, filePaths, isLoading);
  useSyncTreeSearch(model, rootPath, filePaths, isLoading, searchQuery);
  useSyncTreeSelection(model, rootPath, activeFile, filePaths, isLoading);
  useSyncTreeGitStatus(model, rootPath);

  // Branch on workspace/listing state before the tree itself; kept as a local
  // helper (not nested ternaries) so each state stays readable.
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
      return (
        <div className="flex justify-center py-4">
          <Spinner size="sm" className="text-editor-fg-muted" />
        </div>
      );
    }
    return (
      <ContextMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <ContextMenuTrigger asChild>
          {/* Keyboard navigation/activation is owned by the embedded
              PierreFileTree; this wrapper's pointer handlers only augment it
              (PDF routing, double-click pin, context menu). */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handling is delegated to PierreFileTree */}
          <div
            aria-label={activeWorkspace.name}
            className="h-full"
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            role="tree"
          >
            <PierreFileTree
              data-scrollbar-visible={isScrollbarVisible ? "true" : undefined}
              model={model}
              style={FILE_TREE_STYLE}
            />
          </div>
        </ContextMenuTrigger>
        {menuTarget && rootPath ? (
          <ContextMenuContent className="min-w-36">
            <FileTreeContextMenuItems rootPath={rootPath} target={menuTarget} />
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
    );
  }

  const showSearch =
    activeWorkspace != null && workspaceFiles.status !== "error";

  return (
    <div
      // Shared horizontal inset for search, synthetic root, and Pierre rows so
      // hover chips share the same left/right edges (no per-row pe guessing).
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

      {/* Synthetic workspace root: same content width as Pierre rows below
          (parent pe-2/ps-2 + FILE_TREE_STYLE zero list insets). */}
      <button
        aria-expanded={rootExpanded}
        aria-label={
          rootExpanded ? t("fileTree.collapseTree") : t("fileTree.expandTree")
        }
        className={cn(
          "flex w-full min-w-0 shrink-0 items-center gap-0.5 rounded-control px-0.5 py-1 text-start text-body text-editor-fg",
          "hover:bg-editor-tab-hover-bg",
        )}
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
          {activeWorkspace?.name ?? t("states.noWorkspace")}
        </span>
      </button>

      {rootExpanded ? (
        <div className="min-h-0 flex-1 overflow-hidden">{renderTreeBody()}</div>
      ) : null}
    </div>
  );
}
