import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  List,
  ListTree,
  Minus,
  PanelLeft,
  Plus,
  Search,
  Undo2,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { Input } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Text } from "@/components/ui/text";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitFileStagedState } from "@/lib";
import { cn } from "@/lib/utils";
import {
  GitChangesCommitPopover,
  type GitCommitAction,
  type GitCommitActionResult,
} from "./git-changes-commit-popover";
import {
  GitChangesDiffStack,
  type GitChangesDiffStackProps,
} from "./git-changes-diff-stack";
import { GitChangesFileList } from "./git-changes-file-list";
import {
  computeDiffStats,
  filterEntriesByPathQuery,
} from "./git-changes-model";
import {
  gitRevealAtom,
  gitSelectedPathAtom,
  revealGitFileAtom,
} from "./git-changes-store";
import { ToolbarButton } from "./git-changes-toolbar";
import { fromGitTreePath, toGitTreePath } from "./git-changes-tree-paths";
import {
  useSyncGitChangesTreeModel,
  useSyncGitChangesTreeSelection,
} from "./git-changes-tree-sync";
import { TREE_STYLE, TREES_UNSAFE_CSS } from "./tree-style";

// How the leading file index lays out its rows: nested folders, or one flat
// column of the changed files.
type FileIndexView = "tree" | "list";

interface GitChangesTreeProps extends GitChangesDiffStackProps {
  // Display name for the synthetic top-level folder (workspace root).
  workspaceName: string;
  showTreePanel: boolean;
  stagedState: GitFileStagedState;
  actionsBusy: boolean;
  currentBranch: string | null;
  hasChanges: boolean;
  onDiscardAll: () => void;
  onCommitAction: (
    action: GitCommitAction,
    options: { message: string; includeUnstaged: boolean },
  ) => Promise<GitCommitActionResult> | GitCommitActionResult;
  onGenerateCommitMessage: (options: {
    includeUnstaged: boolean;
  }) => Promise<string | null>;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onTreePanelVisibleChange: (visible: boolean) => void;
}

// The tree is an index beside the shared diff stack: picking a row scrolls the
// stack to that file, and scrolling the stack moves the tree's focus along, so
// the two never drift apart.
export function GitChangesTree({
  entries,
  workspaceName,
  showTreePanel,
  actionsEnabled,
  stagedState,
  actionsBusy,
  currentBranch,
  hasChanges,
  onDiscardAll,
  onCommitAction,
  onGenerateCommitMessage,
  onStageAll,
  onUnstageAll,
  onTreePanelVisibleChange,
  ...stackProps
}: GitChangesTreeProps) {
  const { t } = useTranslation("editor");
  const selectedPath = useAtomValue(gitSelectedPathAtom);
  const revealFile = useSetAtom(revealGitFileAtom);
  const reveal = useAtomValue(gitRevealAtom);
  const [searchQuery, setSearchQuery] = useState("");
  const [fileIndexView, setFileIndexView] = useState<FileIndexView>("tree");
  const [appliedRevealToken, setAppliedRevealToken] = useState(0);
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);
  const programmaticSelectionRef = useRef(false);
  const listEntries = useMemo(
    () => filterEntriesByPathQuery(entries, searchQuery),
    [entries, searchQuery],
  );
  const stats = useMemo(() => computeDiffStats(entries), [entries]);

  // A reveal target must not stay hidden behind the tree's own search filter.
  if (reveal && reveal.token !== appliedRevealToken) {
    setAppliedRevealToken(reveal.token);
    if (searchQuery.length > 0) {
      setSearchQuery("");
    }
  }

  // Picking a file is an explicit jump, not just a selection write: the reveal
  // is what makes the stack scroll to the file and open it.
  const handlePickFile = useCallback(
    (relative: string) => {
      if (relative === selectedPath) return;
      revealFile(relative);
    },
    [revealFile, selectedPath],
  );

  const handleSelectionChange = useCallback(
    (selectedPaths: readonly string[]) => {
      // Selecting a row on the diff stack's behalf is not the reader picking a
      // file: turning that echo into a reveal would drag the stack back to a
      // file the reader has already scrolled past.
      if (programmaticSelectionRef.current) return;
      const next = selectedPaths[0];
      // Directory rows end with "/"; only files map to a diff.
      if (!next || next.endsWith("/")) return;
      const relative = fromGitTreePath(workspaceName, next);
      if (!relative) return;
      handlePickFile(relative);
    },
    [handlePickFile, workspaceName],
  );

  const { model } = useFileTree({
    paths: [],
    initialExpansion: "open",
    flattenEmptyDirectories: true,
    // Filter via model.setSearch from the external input (hide-non-matches).
    // Keep Pierre's built-in search chrome off so we own layout and i18n.
    fileTreeSearchMode: "hide-non-matches",
    onSelectionChange: handleSelectionChange,
    unsafeCSS: TREES_UNSAFE_CSS,
    icons: { set: "complete", colored: true },
  });

  useSyncGitChangesTreeModel(model, entries, workspaceName, searchQuery);
  useSyncGitChangesTreeSelection(
    model,
    selectedPath ? toGitTreePath(workspaceName, selectedPath) : null,
    programmaticSelectionRef,
  );

  return (
    // Draggable split between the file index and the diffs it points at.
    <ResizablePanelGroup className="min-h-0 flex-1" orientation="horizontal">
      {showTreePanel ? (
        <>
          <ResizablePanel
            className="flex flex-col overflow-hidden"
            defaultSize="28%"
            maxSize="50%"
            minSize="15%"
          >
            {/* Top padding separates the tree chrome from the scope/filter
                toolbar above; the search field, the layout toggle, and the rows
                share the same horizontal inset. */}
            <div className="flex min-h-0 flex-1 flex-col px-2 pt-2">
              <div className="flex shrink-0 items-center gap-1">
                <div className="relative min-w-0 flex-1">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-editor-fg-subtle"
                  />
                  <Input
                    aria-label={t("git.treeSearch")}
                    className={cn(
                      "h-7 rounded-control border-editor-border bg-editor-canvas ps-7 pe-2 text-body",
                      "placeholder:text-editor-fg-subtle",
                    )}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t("git.treeSearchPlaceholder")}
                    value={searchQuery}
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <TitlebarIconButton
                        aria-label={
                          fileIndexView === "tree"
                            ? t("git.switchToListView")
                            : t("git.switchToTreeView")
                        }
                        onClick={() =>
                          setFileIndexView((prev) =>
                            prev === "tree" ? "list" : "tree",
                          )
                        }
                      >
                        {/* The glyph previews the layout the click switches to. */}
                        {fileIndexView === "tree" ? (
                          <List className={TITLEBAR_ICON_GLYPH_CLASS} />
                        ) : (
                          <ListTree className={TITLEBAR_ICON_GLYPH_CLASS} />
                        )}
                      </TitlebarIconButton>
                    }
                  />
                  <TooltipContent side="top" sideOffset={6}>
                    {fileIndexView === "tree"
                      ? t("git.switchToListView")
                      : t("git.switchToTreeView")}
                  </TooltipContent>
                </Tooltip>
              </div>
              {fileIndexView === "tree" ? (
                <div
                  className="flex min-h-0 flex-1 flex-col"
                  onPointerEnter={() => setIsScrollbarVisible(true)}
                  onPointerLeave={() => setIsScrollbarVisible(false)}
                >
                  <PierreFileTree
                    data-scrollbar-visible={
                      isScrollbarVisible ? "true" : undefined
                    }
                    model={model}
                    style={TREE_STYLE}
                  />
                </div>
              ) : (
                <GitChangesFileList
                  entries={listEntries}
                  onSelect={handlePickFile}
                  selectedPath={selectedPath}
                />
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle />
        </>
      ) : null}
      <ResizablePanel className="flex min-w-0 flex-col overflow-hidden">
        <DiffActionsStrip
          actionsBusy={actionsBusy}
          actionsEnabled={actionsEnabled}
          additions={stats.additions}
          currentBranch={currentBranch}
          deletions={stats.deletions}
          fileCount={entries.length}
          hasChanges={hasChanges}
          showTreePanel={showTreePanel}
          stagedState={stagedState}
          onCommitAction={onCommitAction}
          onDiscardAll={onDiscardAll}
          onGenerateCommitMessage={onGenerateCommitMessage}
          onStageAll={onStageAll}
          onTreePanelVisibleChange={onTreePanelVisibleChange}
          onUnstageAll={onUnstageAll}
        />
        <GitChangesDiffStack
          actionsEnabled={actionsEnabled}
          entries={entries}
          {...stackProps}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function DiffActionsStrip({
  actionsEnabled,
  stagedState,
  actionsBusy,
  additions,
  currentBranch,
  deletions,
  fileCount,
  hasChanges,
  showTreePanel,
  onCommitAction,
  onDiscardAll,
  onGenerateCommitMessage,
  onStageAll,
  onUnstageAll,
  onTreePanelVisibleChange,
}: {
  actionsEnabled: boolean;
  stagedState: GitFileStagedState;
  actionsBusy: boolean;
  additions: number;
  currentBranch: string | null;
  deletions: number;
  fileCount: number;
  hasChanges: boolean;
  showTreePanel: boolean;
  onCommitAction: (
    action: GitCommitAction,
    options: { message: string; includeUnstaged: boolean },
  ) => Promise<GitCommitActionResult> | GitCommitActionResult;
  onDiscardAll: () => void;
  onGenerateCommitMessage: (options: {
    includeUnstaged: boolean;
  }) => Promise<string | null>;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onTreePanelVisibleChange: (visible: boolean) => void;
}) {
  const { t } = useTranslation("editor");
  const [discardOpen, setDiscardOpen] = useState(false);
  return (
    <div className="shrink-0 px-2 pt-2">
      <div className="flex h-7 items-center gap-1">
        <ToolbarButton
          active={showTreePanel}
          icon={<PanelLeft className={TITLEBAR_ICON_GLYPH_CLASS} />}
          label={showTreePanel ? t("git.hideFileTree") : t("git.showFileTree")}
          onClick={() => onTreePanelVisibleChange(!showTreePanel)}
        />
        <div className="mx-1 flex min-w-0 items-center gap-2">
          <Text tone="muted" className="truncate">
            {t("git.fileCount", { count: fileCount })}
          </Text>
          <Text className="shrink-0 text-editor-git-added">+{additions}</Text>
          <Text className="shrink-0 text-editor-git-deleted">−{deletions}</Text>
        </div>
        <div className="ms-auto flex items-center gap-1">
          {actionsEnabled ? (
            <>
              <ToolbarButton
                disabled={actionsBusy}
                icon={<Undo2 className={TITLEBAR_ICON_GLYPH_CLASS} />}
                label={t("git.discardAll")}
                onClick={() => setDiscardOpen(true)}
              />
              <ToolbarButton
                disabled={actionsBusy || stagedState === "staged"}
                icon={<Plus className={TITLEBAR_ICON_GLYPH_CLASS} />}
                label={t("git.stageAll")}
                onClick={onStageAll}
              />
              <ToolbarButton
                disabled={actionsBusy || stagedState === "unstaged"}
                icon={<Minus className={TITLEBAR_ICON_GLYPH_CLASS} />}
                label={t("git.unstageAll")}
                onClick={onUnstageAll}
              />
              <GitChangesCommitPopover
                currentBranch={currentBranch}
                hasChanges={hasChanges}
                onAction={onCommitAction}
                onGenerateMessage={onGenerateCommitMessage}
                parentBusy={actionsBusy}
              />
            </>
          ) : null}
        </div>
      </div>
      <Dialog onOpenChange={setDiscardOpen} open={discardOpen}>
        <DialogContent size="compact">
          <DialogHeader>
            <DialogTitle>{t("git.discardAll")}</DialogTitle>
            <DialogDescription>
              {t("git.discardAllConfirm", { count: fileCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="ghost">{t("git.cancel")}</Button>}
            />
            <Button
              onClick={() => {
                onDiscardAll();
                setDiscardOpen(false);
              }}
              variant="destructive"
            >
              {t("git.discard")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
