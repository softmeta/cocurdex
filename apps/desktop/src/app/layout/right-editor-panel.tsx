import {
  type MessageAttachment,
  primaryWorkspaceRootPath,
} from "@cocurdex/shared";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { Search } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResizeSeparator } from "@/components/resize-separator";
import { beginColumnResize } from "@/components/use-column-resize";
import { BrowserPanel } from "@/features/browser";
import { DecksView } from "@/features/decks";
import {
  EditorBreadcrumb,
  EditorTabs,
  FileTree,
  fileTreeVisibleAtom,
  GitChanges,
  openFileAtom,
  rightPanelResizingAtom,
  SearchPanel,
  SearchResultsPane,
  setChatComposerAttachmentAtom,
} from "@/features/editor";
import { MonacoEditor } from "@/features/editor/monaco";
import { IssuesView } from "@/features/issues";
import { MemoryLibraryView } from "@/features/memory";
import { NotesView } from "@/features/notes";
import { openPdfsAtom } from "@/features/pdf-reader";
import { RoutinesView } from "@/features/routines";
import {
  type AppearanceSettings,
  defaultAppearanceSettings,
} from "@/features/settings";
import { useAppShortcuts } from "@/features/shortcuts";
import {
  NO_WORKSPACE_TERMINAL_SCOPE_ID,
  TerminalPanel,
} from "@/features/terminal";
import {
  activeWorkingPathAtom,
  activeWorkspaceIdAtom,
  workspacesAtom,
} from "@/features/workspaces";
import { cn, desktopApi, useMountEffect } from "@/lib";
import { AssistantOverview } from "./assistant-overview";
import { ConversationFiles } from "./conversation-files";
import { PanScrollbar } from "./pan-scrollbar";
import { PanelToolbar } from "./panel-toolbar";
import { PdfReaderView } from "./pdf-reader-view";
import {
  fileTreeWidthAtom,
  type RightPanelView,
  rightPanelLastNonTerminalViewAtom,
  rightPanelModeAtom,
  rightPanelResolvedActiveViewAtom,
  rightPanelTerminalEverActiveAtom,
  rightPanelViewTouchedAtom,
} from "./right-editor-panel-store";
import {
  SidebarToggleButton,
  TitlebarIconButton,
} from "./titlebar-icon-button";
import { useOpenPersonalSession } from "./use-open-personal-session";
import { ViewSwitcherTabs } from "./view-switcher-tabs";

const MIN_FILE_TREE_WIDTH = 170;
const MIN_EDITOR_WIDTH = 240;
const INTERNAL_SEPARATOR_WIDTH = 1;
const PANNABLE_VIEWS = new Set<RightPanelView>(["pdf", "terminal"]);

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

export interface RightEditorPanelProps {
  onClose(): void;
  appearanceSettings?: AppearanceSettings;
  reserveTrafficLights?: boolean;
  overlayInset?: number;
  onAddContextToChat?(attachment: MessageAttachment): boolean;
  onInsertTextToChat?(text: string): boolean;
  viewSwitcherLeading?: ReactNode;
  viewSwitcherTrailing?: ReactNode;
}

export function RightEditorPanel({
  onClose,
  appearanceSettings = defaultAppearanceSettings,
  onAddContextToChat,
  onInsertTextToChat,
  overlayInset = 0,
  reserveTrafficLights = false,
  viewSwitcherLeading,
  viewSwitcherTrailing,
}: RightEditorPanelProps) {
  const { t } = useTranslation("editor");
  const { t: tSearch } = useTranslation("search");
  const store = useStore();
  const conversationFiles = useAtomValue(rightPanelModeAtom) !== "work";
  const openRoutineSession = useOpenPersonalSession();
  const [fileTreeWidth, setFileTreeWidth] = useAtom(fileTreeWidthAtom);
  const [fileTreeVisible, setFileTreeVisible] = useAtom(fileTreeVisibleAtom);
  const [searchPanelVisible, setSearchPanelVisible] = useState(false);
  const hasPdfsOpen = useAtomValue(openPdfsAtom).length > 0;
  const [activeView, setActiveView] = useAtom(rightPanelResolvedActiveViewAtom);
  const [lastNonTerminalView, setLastNonTerminalViewAtom] = useAtom(
    rightPanelLastNonTerminalViewAtom,
  );
  const setLastNonTerminalView = useCallback(
    (view: RightPanelView) => {
      if (view === "pdf" || view === "terminal") {
        return;
      }
      setLastNonTerminalViewAtom(view);
      store.set(rightPanelViewTouchedAtom, true);
    },
    [setLastNonTerminalViewAtom, store],
  );
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
  const [gitKeepAlive, setGitKeepAlive] = useState(false);
  const gitEverActive = gitKeepAlive || activeView === "git";
  if (gitEverActive && !gitKeepAlive) {
    setGitKeepAlive(true);
  }
  const pdfEverActive = hasPdfsOpen || activeView === "pdf";
  const [notesKeepAlive, setNotesKeepAlive] = useState(false);
  const notesEverActive = notesKeepAlive || activeView === "notes";
  const [decksKeepAlive, setDecksKeepAlive] = useState(false);
  const decksEverActive = decksKeepAlive || activeView === "decks";
  const [issuesKeepAlive, setIssuesKeepAlive] = useState(false);
  const issuesEverActive = issuesKeepAlive || activeView === "issues";
  const setChatComposerAttachment = useSetAtom(setChatComposerAttachmentAtom);
  const setRightPanelResizing = useSetAtom(rightPanelResizingAtom);
  const openFile = useSetAtom(openFileAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const workingPath = useAtomValue(activeWorkingPathAtom);
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );
  const [homeDir, setHomeDir] = useState<string | null>(null);
  useMountEffect(() => {
    void desktopApi.getHomeDir().then(setHomeDir);
  });
  const terminalWorkspaceId =
    activeWorkspace?.id ?? NO_WORKSPACE_TERMINAL_SCOPE_ID;
  const terminalCwd = workingPath ?? activeWorkspace?.rootPaths[0] ?? homeDir;
  const contentRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const fileTreeWidthRef = useRef(fileTreeWidth);
  const removeDragListenersRef = useRef<(() => void) | null>(null);

  fileTreeWidthRef.current = fileTreeWidth;

  useAppShortcuts({
    toggleWorkspaceSearch: () => {
      if (conversationFiles) return;
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

      const rootPath = (
        workingPath ?? primaryWorkspaceRootPath(activeWorkspace)
      ).replace(/\/$/, "");
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
      workingPath,
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
  const pannable = overlayInset > 0 && PANNABLE_VIEWS.has(activeView);

  return (
    <aside
      className="flex h-full min-w-0 flex-col overflow-hidden bg-editor-shell"
      ref={handlePanelRef}
    >
      <ViewSwitcherTabs
        activeView={activeView}
        hasPdfsOpen={hasPdfsOpen}
        reserveTrafficLights={reserveTrafficLights}
        leading={viewSwitcherLeading}
        trailing={viewSwitcherTrailing}
        onViewChange={(value) => {
          setActiveView(value);
          if (value === "terminal") {
            setTerminalEverActive(true);
          } else {
            setLastNonTerminalView(value);
          }
          if (value === "editor") {
            setFileTreeVisible(true);
          }
          if (value === "notes") {
            setNotesKeepAlive(true);
          }
          if (value === "decks") {
            setDecksKeepAlive(true);
          }
          if (value === "issues") {
            setIssuesKeepAlive(true);
          }
        }}
      />

      {activeView === "editor" ? (
        <PanelToolbar
          className="app-drag relative z-30 gap-1"
          data-testid="editor-panel-toolbar"
        >
          <SidebarToggleButton
            label={t("actions.explorer")}
            open={fileTreeVisible && !searchPanelVisible}
            onToggle={showFileTreePanel}
          />
          {!conversationFiles ? (
            <TitlebarIconButton
              active={searchPanelVisible}
              aria-label={tSearch("searchFiles")}
              onClick={toggleSearchPanel}
            >
              <Search className="size-3.5" />
            </TitlebarIconButton>
          ) : null}
          <div className="min-w-0 flex-1">
            <EditorTabs />
          </div>
        </PanelToolbar>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            "scrollbar-hide relative flex min-h-0 flex-1 flex-col",
            pannable && "overflow-x-auto overflow-y-hidden",
          )}
          ref={bodyScrollRef}
        >
          <div
            className="relative flex min-h-0 flex-1 flex-col"
            style={
              pannable
                ? { minWidth: `calc(100% + ${overlayInset}px)` }
                : undefined
            }
          >
            {activeView === "overview" ? <AssistantOverview /> : null}
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
                      {conversationFiles ? <ConversationFiles /> : null}
                      {!conversationFiles && searchPanelVisible ? (
                        <div className="flex min-h-0 flex-1 flex-col">
                          <div className="border-b border-editor-border p-2">
                            <SearchPanel
                              rootPath={
                                workingPath ??
                                activeWorkspace?.rootPaths[0] ??
                                null
                              }
                            />
                          </div>
                          <SearchResultsPane
                            rootPath={
                              workingPath ??
                              activeWorkspace?.rootPaths[0] ??
                              null
                            }
                          />
                        </div>
                      ) : null}
                      {!conversationFiles && !searchPanelVisible ? (
                        <FileTree />
                      ) : null}
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
                <BrowserPanel onClose={onClose} />
              </div>
            ) : null}

            {pdfEverActive ? (
              <div
                className={cn(
                  "absolute inset-0 flex min-h-0 flex-col",
                  activeView === "pdf"
                    ? "visible"
                    : "hidden pointer-events-none",
                )}
              >
                <PdfReaderView
                  isActive={activeView === "pdf"}
                  onInsertTextToChat={onInsertTextToChat}
                />
              </div>
            ) : null}

            {notesEverActive ? (
              <div
                data-testid="right-panel-notes-layer"
                className={cn(
                  "absolute inset-0 flex min-h-0 flex-col",
                  activeView === "notes"
                    ? "visible"
                    : "hidden pointer-events-none",
                )}
              >
                <NotesView />
              </div>
            ) : null}

            {decksEverActive ? (
              <div
                data-testid="right-panel-decks-layer"
                className={cn(
                  "absolute inset-0 flex min-h-0 flex-col",
                  activeView === "decks"
                    ? "visible"
                    : "hidden pointer-events-none",
                )}
              >
                <DecksView />
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
                <IssuesView />
              </div>
            ) : null}

            {activeView === "memory" ? (
              <div
                data-testid="right-panel-memory-layer"
                className="absolute inset-0 flex min-h-0 flex-col"
              >
                <MemoryLibraryView />
              </div>
            ) : null}

            {activeView === "routines" ? (
              <div
                data-testid="right-panel-routines-layer"
                className="absolute inset-0 flex min-h-0 flex-col"
              >
                <RoutinesView onOpenSession={openRoutineSession} />
              </div>
            ) : null}

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

            {terminalEverActive && terminalCwd ? (
              <div
                data-testid="editor-terminal-pane"
                className={cn(
                  "absolute inset-0 flex",
                  activeView === "terminal"
                    ? "visible"
                    : "invisible pointer-events-none",
                )}
              >
                <TerminalPanel
                  cwd={terminalCwd}
                  isActive={activeView === "terminal"}
                  onEmptied={() => setActiveView(lastNonTerminalView)}
                  workspaceId={terminalWorkspaceId}
                />
              </div>
            ) : null}
          </div>
        </div>
        {pannable ? <PanScrollbar viewportRef={bodyScrollRef} /> : null}
      </div>
    </aside>
  );
}
