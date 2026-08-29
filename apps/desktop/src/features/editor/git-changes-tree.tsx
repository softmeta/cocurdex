import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { FileDiff, Search } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, Input } from "@/components/ui";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { GitChangeFileDiff } from "./git-changes-file-diff";
import type { GitChangeEntry } from "./git-changes-model";
import type { GitDiffStyle } from "./git-changes-toolbar";
import { fromGitTreePath, toGitTreePath } from "./git-changes-tree-paths";
import {
  useSyncGitChangesTreeModel,
  useSyncGitChangesTreeSelection,
} from "./git-changes-tree-sync";
import { TREE_STYLE, TREES_UNSAFE_CSS } from "./tree-style";

interface GitChangesTreeProps {
  entries: GitChangeEntry[];
  // Display name for the synthetic top-level folder (workspace root).
  workspaceName: string;
  diffStyle: GitDiffStyle;
  wrap: boolean;
  expandUnchanged: boolean;
  actionsEnabled: boolean;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  onOpenFile: (path: string) => void;
  diffThemeType: "light" | "dark";
}

const noop = () => undefined;

// Master-detail git changes view: a virtualized file tree on the leading edge
// drives a single expanded diff on the trailing pane.
export function GitChangesTree({
  entries,
  workspaceName,
  diffStyle,
  wrap,
  expandUnchanged,
  actionsEnabled,
  onStage,
  onUnstage,
  onDiscard,
  onOpenFile,
  diffThemeType,
}: GitChangesTreeProps) {
  const { t } = useTranslation("editor");
  // Selection is stored as a repo-relative path (matches GitChangeEntry.path).
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);

  // Derive the shown entry instead of mirroring it into state: a stale
  // selection (after refresh/discard) gracefully falls back to the first file.
  const selectedEntry =
    entries.find((entry) => entry.path === selectedPath) ?? entries[0] ?? null;

  const handleSelectionChange = useCallback(
    (selectedPaths: readonly string[]) => {
      const next = selectedPaths[0];
      // Directory rows end with "/"; only files map to a diff.
      if (!next || next.endsWith("/")) return;
      const relative = fromGitTreePath(workspaceName, next);
      if (!relative) return;
      setSelectedPath(relative);
    },
    [workspaceName],
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
    selectedEntry ? toGitTreePath(workspaceName, selectedEntry.path) : null,
  );

  return (
    // Draggable split between the file tree and the selected-file diff.
    <ResizablePanelGroup className="min-h-0 flex-1" orientation="horizontal">
      <ResizablePanel
        className="flex flex-col overflow-hidden"
        defaultSize="28%"
        maxSize="50%"
        minSize="15%"
      >
        {/* Top padding separates the tree chrome from the scope/filter toolbar
            above; the search field and rows share the same horizontal inset. */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 pt-2">
          <div className="relative shrink-0">
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
          <div
            className="flex min-h-0 flex-1 flex-col"
            onPointerEnter={() => setIsScrollbarVisible(true)}
            onPointerLeave={() => setIsScrollbarVisible(false)}
          >
            <PierreFileTree
              data-scrollbar-visible={isScrollbarVisible ? "true" : undefined}
              model={model}
              style={TREE_STYLE}
            />
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        className="min-w-0 overflow-auto px-3 py-2"
        style={{ "--diffs-gap-block": "2px" } as CSSProperties}
      >
        {selectedEntry ? (
          <GitChangeFileDiff
            actionsEnabled={actionsEnabled}
            collapsed={false}
            diffStyle={diffStyle}
            diffThemeType={diffThemeType}
            entry={selectedEntry}
            expandUnchanged={expandUnchanged}
            hideToggle
            onDiscard={onDiscard}
            onOpenFile={onOpenFile}
            onStage={onStage}
            onToggle={noop}
            onUnstage={onUnstage}
            wrap={wrap}
          />
        ) : (
          <EmptyState
            description={t("git.treeNoSelectionDescription")}
            icon={<FileDiff />}
            title={t("git.treeNoSelectionTitle")}
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
