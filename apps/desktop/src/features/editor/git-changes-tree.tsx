import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { useAtomValue, useSetAtom } from "jotai";
import { Search } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import {
  GitChangesDiffStack,
  type GitChangesDiffStackProps,
} from "./git-changes-diff-stack";
import {
  gitRevealAtom,
  gitSelectedPathAtom,
  revealGitFileAtom,
} from "./git-changes-store";
import { fromGitTreePath, toGitTreePath } from "./git-changes-tree-paths";
import {
  useSyncGitChangesTreeModel,
  useSyncGitChangesTreeSelection,
} from "./git-changes-tree-sync";
import { TREE_STYLE, TREES_UNSAFE_CSS } from "./tree-style";

interface GitChangesTreeProps extends GitChangesDiffStackProps {
  // Display name for the synthetic top-level folder (workspace root).
  workspaceName: string;
  showTreePanel: boolean;
}

// The tree is an index beside the shared diff stack: picking a row scrolls the
// stack to that file, and scrolling the stack moves the tree's focus along, so
// the two never drift apart.
export function GitChangesTree({
  entries,
  workspaceName,
  showTreePanel,
  ...stackProps
}: GitChangesTreeProps) {
  const { t } = useTranslation("editor");
  const selectedPath = useAtomValue(gitSelectedPathAtom);
  const revealFile = useSetAtom(revealGitFileAtom);
  const reveal = useAtomValue(gitRevealAtom);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedRevealToken, setAppliedRevealToken] = useState(0);
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);
  const programmaticSelectionRef = useRef(false);

  // A reveal target must not stay hidden behind the tree's own search filter.
  if (reveal && reveal.token !== appliedRevealToken) {
    setAppliedRevealToken(reveal.token);
    if (searchQuery.length > 0) {
      setSearchQuery("");
    }
  }

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
      if (!relative || relative === selectedPath) return;
      // Picking a file is an explicit jump, not just a selection write: the
      // reveal is what makes the stack scroll to the file and open it.
      revealFile(relative);
    },
    [revealFile, selectedPath, workspaceName],
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
                toolbar above; the search field and rows share the same
                horizontal inset. */}
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
                  data-scrollbar-visible={
                    isScrollbarVisible ? "true" : undefined
                  }
                  model={model}
                  style={TREE_STYLE}
                />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle />
        </>
      ) : null}
      <ResizablePanel className="flex min-w-0 flex-col overflow-hidden">
        <GitChangesDiffStack entries={entries} {...stackProps} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
