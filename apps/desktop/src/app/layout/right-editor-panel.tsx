import type { MessageAttachment } from "@cocurdex/shared";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { PanelLeft, Search } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResizeSeparator } from "@/components/resize-separator";
import { beginColumnResize } from "@/components/use-column-resize";
import { BrowserPanel } from "@/features/browser";
import {
  EditorBreadcrumb,
  EditorTabs,
  FileTree,
  fileTreeVisibleAtom,
  GitChanges,
  MonacoEditor,
  openFileAtom,
  rightPanelResizingAtom,
  SearchPanel,
  SearchResultsPane,
  setChatComposerAttachmentAtom,
} from "@/features/editor";
import { openPdfsAtom } from "@/features/pdf-reader";
import {
  type AppearanceSettings,
  defaultAppearanceSettings,
} from "@/features/settings";
import { useAppShortcuts } from "@/features/shortcuts";
import {
  NO_WORKSPACE_TERMINAL_SCOPE_ID,
  TerminalPanel,
} from "@/features/terminal";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { cn, desktopApi, useMountEffect } from "@/lib";
import { PdfReaderView } from "./pdf-reader-view";
import {
  fileTreeWidthAtom,
  type RightPanelView,
  rightPanelLastNonTerminalViewAtom,
  rightPanelResolvedActiveViewAtom,
  rightPanelTerminalEverActiveAtom,
  rightPanelViewTouchedAtom,
} from "./right-editor-panel-store";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "./titlebar-icon-button";
import { ViewSwitcherTabs } from "./view-switcher-tabs";

// Notes pulls in Tiptap/ProseMirror (~200-300 KB gzip); defer that chunk until
// the user first activates the tab.
const NotesView = lazy(() =>
  import("@/features/notes").then((m) => ({ default: m.NotesView })),
);

const IssuesView = lazy(() =>
  import("@/features/issues").then((m) => ({ default: m.IssuesView })),
);

const MIN_FILE_TREE_WIDTH = 170;
const MIN_EDITOR_WIDTH = 240;
const INTERNAL_SEPARATOR_WIDTH = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getContainerWidth(container: HTMLDivElement | null) {
  return container?.clientWidth ?? 0;
}

function getMaxFileTreeWidth(totalWidth: number) {
  return Math.max(
    MIN_FILE_TREE_WIDTH,
    totalWidth - MIN_EDITOR_WIDTH - INTERNAL_SEPARATOR_WIDTH,
  );
}

function clampFileTreeWidth(nextWidth: number, totalWidth: number) {
  return clamp(nextWidth, MIN_FILE_TREE_WIDTH, getMaxFileTreeWidth(totalWidth));
}

interface RightEditorPanelProps {
  appearanceSettings?: AppearanceSettings;
  // In global (fullscreen) mode the panel reaches the window's left edge, so the
  // view switcher must clear the macOS traffic-light buttons.
  reserveTrafficLights?: boolean;
  onAddContextToChat?(attachment: MessageAttachment): boolean;
  onInsertTextToChat?(text: string): boolean;
}

export function RightEditorPanel({
  appearanceSettings = defaultAppearanceSettings,
  onAddContextToChat,
  onInsertTextToChat,
  reserveTrafficLights = false,
}: RightEditorPanelProps) {
  const { t } = useTranslation("editor");
  const { t: tSearch } = useTranslation("search");
  const store = useStore();
  // Atom-backed so a drag-resized width survives panel collapse/remount.
  const [fileTreeWidth, setFileTreeWidth] = useAtom(fileTreeWidthAtom);
  // Shared so a chat path link can collapse the explorer straight from its click
  // handler; persists across the panel's collapse/remount like the view atoms.
  const [fileTreeVisible, setFileTreeVisible] = useAtom(fileTreeVisibleAtom);
  const [searchPanelVisible, setSearchPanelVisible] = useState(false);
  const hasPdfsOpen = useAtomValue(openPdfsAtom).length > 0;
  const [activeView, setActiveView] = useAtom(rightPanelResolvedActiveViewAtom);
  const [lastNonTerminalView, setLastNonTerminalViewAtom] = useAtom(
    rightPanelLastNonTerminalViewAtom,
  );
  const setLastNonTerminalView = useCallback(
    (view: RightPanelView) => {
      // PDF / terminal are ephemeral surfaces — remember the last durable tab
      // so closing the last PDF (or terminal) can return somewhere useful.
      if (view === "pdf" || view === "terminal") {
        return;
      }
      setLastNonTerminalViewAtom(view);
      store.set(rightPanelViewTouchedAtom, true);
    },
    [setLastNonTerminalViewAtom, store],
  );
  // Keep-alive flags: once a lazy pane has been shown it stays mounted so
  // internal state (xterm scrollback, Tiptap, etc.) survives tab switches.
  // Always also mount when `activeView` is that tab — including cold-start
  // restore — so we never show a selected tab with an empty body. Mirrors
  // pdfEverActive below; do not seed from store.get once in useState alone
  // (storage may hydrate after the first paint).
  const [terminalKeepAlive, setTerminalKeepAlive] = useState(() =>
    store.get(rightPanelTerminalEverActiveAtom),
  );
  const terminalEverActive = terminalKeepAlive || activeView === "terminal";
  const setTerminalEverActive = useCallback(
    (value: boolean) => {
      setTerminalKeepAlive(value);
      store.set(rightPanelTerminalEverActiveAtom, value);
    },
    [store],
  );
  // Git panel stays mounted after first activation, like the terminal: parsing
  // 24 file diffs on every remount made tab switches reload + jank. It's the
  // default view, so mount it immediately.
  const [gitEverActive, setGitEverActive] = useState(true);
  const pdfEverActive = hasPdfsOpen || activeView === "pdf";
  // Notes editor stays mounted after first activation so the Tiptap instance
  // (and any unsaved-but-debounced edits) survive view switches.
  const [notesKeepAlive, setNotesKeepAlive] = useState(false);
  const notesEverActive = notesKeepAlive || activeView === "notes";
  const [issuesKeepAlive, setIssuesKeepAlive] = useState(false);
  const issuesEverActive = issuesKeepAlive || activeView === "issues";
  const setChatComposerAttachment = useSetAtom(setChatComposerAttachmentAtom);
  const setRightPanelResizing = useSetAtom(rightPanelResizingAtom);
  const openFile = useSetAtom(openFileAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );
  // Terminal works without a project: shell starts in the user home directory.
  // Home is resolved in main (sandboxed preload cannot import node:os).
  const [homeDir, setHomeDir] = useState<string | null>(null);
  useMountEffect(() => {
    void desktopApi.getHomeDir().then(setHomeDir);
  });
  const terminalWorkspaceId =
    activeWorkspace?.id ?? NO_WORKSPACE_TERMINAL_SCOPE_ID;
  const terminalCwd = activeWorkspace?.rootPath ?? homeDir;
  const contentRef = useRef<HTMLDivElement | null>(null);
  const fileTreeWidthRef = useRef(fileTreeWidth);
  const removeDragListenersRef = useRef<(() => void) | null>(null);

  fileTreeWidthRef.current = fileTreeWidth;

  useAppShortcuts({
    toggleWorkspaceSearch: () => {
      setActiveView("editor");
      setSearchPanelVisible((prev) => {
        const next = !prev;
        if (next) {
          setFileTreeVisible(true);
        }
        return next;
      });
    },
  });

  const cleanupDragListeners = useCallback(() => {
    removeDragListenersRef.current?.();
    removeDragListenersRef.current = null;
    setRightPanelResizing(false);
  }, [setRightPanelResizing]);

  const handleOpenGitFile = useCallback(
    (relativePath: string) => {
      if (!activeWorkspace) return;

      const rootPath = activeWorkspace.rootPath.replace(/\/$/, "");
      openFile(`${rootPath}/${relativePath}`);
      setFileTreeVisible(true);
      setActiveView("editor");
      setLastNonTerminalView("editor");
    },
    [
      activeWorkspace,
      openFile,
      setActiveView,
      setFileTreeVisible,
      setLastNonTerminalView,
    ],
  );

  const toggleSearchPanel = useCallback(() => {
    setSearchPanelVisible((prev) => {
      const next = !prev;
      if (next) {
        setFileTreeVisible(true);
      }
      return next;
    });
  }, [setFileTreeVisible]);

  const showFileTreePanel = useCallback(() => {
    if (searchPanelVisible) {
      setSearchPanelVisible(false);
      setFileTreeVisible(true);
      return;
    }

    setFileTreeVisible((prev) => !prev);
  }, [searchPanelVisible, setFileTreeVisible]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      cleanupDragListeners();
      removeDragListenersRef.current = beginColumnResize(event, {
        edge: "inline-end",
        startWidth: fileTreeWidthRef.current,
        clamp: (next) =>
          clampFileTreeWidth(next, getContainerWidth(contentRef.current)),
        onWidthChange: setFileTreeWidth,
        onDragStart: () => setRightPanelResizing(true),
        onDragEnd: () => {
          setRightPanelResizing(false);
          removeDragListenersRef.current = null;
        },
      });
    },
    [cleanupDragListeners, setFileTreeWidth, setRightPanelResizing],
  );

  const handlePanelRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node) {
        cleanupDragListeners();
      }
    },
    [cleanupDragListeners],
  );

  const handleContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (!node) {
        return;
      }

      const observer = new ResizeObserver(() => {
        const totalWidth = getContainerWidth(node);
        setFileTreeWidth((prev) => clampFileTreeWidth(prev, totalWidth));
      });
      observer.observe(node);

      return () => {
        observer.disconnect();
        if (contentRef.current === node) {
          contentRef.current = null;
        }
      };
    },
    [setFileTreeWidth],
  );

  const sidebarVisible = fileTreeVisible || searchPanelVisible;
  const sidebarWidth = searchPanelVisible
    ? Math.max(fileTreeWidth, 280)
    : fileTreeWidth;

  return (
    <aside
      className="flex h-full min-w-0 flex-col overflow-hidden border-l border-editor-border bg-editor-shell"
      ref={handlePanelRef}
    >
      <ViewSwitcherTabs
        activeView={activeView}
        hasPdfsOpen={hasPdfsOpen}
        reserveTrafficLights={reserveTrafficLights}
        onViewChange={(value) => {
          setActiveView(value);
          if (value === "terminal") {
            setTerminalEverActive(true);
          } else {
            setLastNonTerminalView(value);
          }
          // Entering the explorer tab should surface the file tree so the empty
          // preview is not the only thing on screen.
          if (value === "editor") {
            setFileTreeVisible(true);
          }
          if (value === "git") {
            setGitEverActive(true);
          }
          if (value === "notes") {
            setNotesKeepAlive(true);
          }
          if (value === "issues") {
            setIssuesKeepAlive(true);
          }
        }}
      />

      {activeView === "editor" ? (
        <div
          className="app-drag relative z-30 flex items-center gap-1 border-b border-editor-border px-2 py-1"
          data-testid="editor-panel-toolbar"
        >
          <TitlebarIconButton
            active={fileTreeVisible && !searchPanelVisible}
            aria-label={t("actions.explorer")}
            onClick={showFileTreePanel}
          >
            <PanelLeft className={TITLEBAR_ICON_GLYPH_CLASS} />
          </TitlebarIconButton>
          <TitlebarIconButton
            active={searchPanelVisible}
            aria-label={tSearch("searchFiles")}
            onClick={toggleSearchPanel}
          >
            <Search className={TITLEBAR_ICON_GLYPH_CLASS} />
          </TitlebarIconButton>
          <div className="min-w-0 flex-1">
            <EditorTabs />
          </div>
        </div>
      ) : null}

      {/*
        Swappable body region. It's a positioned container so the terminal can
        live here as an always-sized absolute layer (see below) rather than a
        display:none sibling — revealing a collapsed xterm reflowed its grid
        for a frame, which read as a cursor/content flash on view switch.
      */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {activeView === "editor" ? (
          <div
            className="flex min-h-0 flex-1"
            data-testid="editor-content-row"
            ref={handleContentRef}
          >
            {sidebarVisible ? (
              <>
                <div
                  className="flex shrink-0 flex-col bg-editor-canvas"
                  data-testid="editor-sidebar-pane"
                  style={{ width: sidebarWidth }}
                >
                  {searchPanelVisible ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="border-b border-editor-border p-2">
                        <SearchPanel
                          rootPath={activeWorkspace?.rootPath ?? null}
                        />
                      </div>
                      <SearchResultsPane
                        rootPath={activeWorkspace?.rootPath ?? null}
                      />
                    </div>
                  ) : (
                    <FileTree />
                  )}
                </div>
                <ResizeSeparator
                  ariaLabel={t("actions.resizeExplorer")}
                  onMouseDown={handleMouseDown}
                />
              </>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col bg-editor-canvas">
              <EditorBreadcrumb />
              <MonacoEditor
                appearanceSettings={appearanceSettings}
                onAddSelectionToChat={(attachment) => {
                  if (onAddContextToChat?.(attachment)) {
                    return;
                  }
                  setChatComposerAttachment(attachment);
                }}
              />
            </div>
          </div>
        ) : null}

        {activeView === "browser" ? (
          <div className="min-h-0 flex-1">
            <BrowserPanel />
          </div>
        ) : null}

        {/*
          PDF reader kept mounted after first activation, like git/terminal:
          remounting would re-read and re-parse the document (which can be large)
          on every tab switch. Use `hidden` (display:none) rather than
          `invisible` so chrome (toolbar icons) and pdf.js canvases leave the
          paint tree immediately on tab switch — visibility:hidden left the
          layer in the compositor and toolbar icons lagged a frame or two.
          Absolute inset-0 + ResizeObserver re-lays out when shown again.
        */}
        {pdfEverActive ? (
          <div
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              activeView === "pdf" ? "visible" : "hidden pointer-events-none",
            )}
          >
            <PdfReaderView
              isActive={activeView === "pdf"}
              onInsertTextToChat={onInsertTextToChat}
            />
          </div>
        ) : null}

        {/*
          Notes editor kept mounted after first activation (like git/pdf) so the
          Tiptap instance and its debounced autosave survive tab and workspace
          switches. Notes remain app-owned and independent of workspace tabs.
        */}
        {notesEverActive ? (
          <div
            data-testid="right-panel-notes-layer"
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              activeView === "notes" ? "visible" : "hidden pointer-events-none",
            )}
          >
            <Suspense fallback={null}>
              <NotesView />
            </Suspense>
          </div>
        ) : null}

        {issuesEverActive ? (
          <div
            data-testid="right-panel-issues-layer"
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              activeView === "issues"
                ? "visible"
                : "hidden pointer-events-none",
            )}
          >
            <Suspense fallback={null}>
              <IssuesView />
            </Suspense>
          </div>
        ) : null}

        {/*
          Git panel kept mounted across view switches (same rationale as the
          terminal layer below): remounting re-fetched the diff and re-parsed
          every file, which showed a "loading" flash and janked on each switch.
          Hidden via visibility so its layout never collapses.
        */}
        {gitEverActive ? (
          <div
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              activeView === "git"
                ? "visible"
                : "invisible pointer-events-none",
            )}
          >
            <GitChanges onOpenFile={handleOpenGitFile} />
          </div>
        ) : null}

        {/*
        Terminal stays mounted across view switches so the xterm scrollback
        buffer and running shell survive when the user toggles back. We hide
        it via CSS rather than unmount; node-pty in main keeps the shell alive
        regardless, but unmounting would drop in-renderer scrollback.
      */}
        {terminalEverActive && terminalCwd ? (
          <div
            data-testid="editor-terminal-pane"
            className={cn(
              // Always laid out at full size as an absolute layer so it never
              // collapses; only visibility/interactivity toggle on view switch.
              "absolute inset-0 flex",
              activeView === "terminal"
                ? "visible"
                : "invisible pointer-events-none",
            )}
          >
            {/*
            No `key` here: the panel stays mounted as workspace/scope changes so
            React doesn't tear down xterm just because of a tree-wide remount.
            TerminalPanel handles workspaceId / cwd prop changes via the attach
            effect. Project shells and the no-workspace (home) shell keep
            separate tab state keys.
          */}
            <TerminalPanel
              cwd={terminalCwd}
              isActive={activeView === "terminal"}
              onEmptied={() => setActiveView(lastNonTerminalView)}
              workspaceId={terminalWorkspaceId}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
