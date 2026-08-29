import { useAtomValue } from "jotai";
import { startTransition, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import type {
  GitBranchInfo,
  GitCommitInfo,
  WorkspaceGitDiffStatus,
  WorkspaceGitFileChange,
} from "@/lib";
import { desktopApi, useResolvedTheme } from "@/lib";
import { rightPanelResizingAtom } from "./editor-store";
import { GitChangesBody } from "./git-changes-body";
import {
  buildEntries,
  computeChangeTypeCounts,
  computeDiffStats,
  computeStagedState,
  filterEntriesByChangeType,
  type GitChangeTypeFilter,
} from "./git-changes-model";
import {
  useGitChangesAutoViewMode,
  useSyncWorkspaceGitChanges,
} from "./git-changes-sync";
import { GitChangesToolbar, type GitDiffStyle } from "./git-changes-toolbar";
import {
  GIT_DEFAULT_DIFF_SCOPE,
  type GitDiffScope,
  isMutableScope,
  resolveBranchScope,
  scopeToQuery,
} from "./git-diff-scope";
import { GIT_DEFAULT_VIEW_MODE, type GitViewMode } from "./git-view-mode";
import { useGitCommitActions } from "./use-git-commit-actions";

export interface GitChangesProps {
  onOpenFile: (path: string) => void;
}

export function GitChanges({ onOpenFile }: GitChangesProps) {
  const { t } = useTranslation("editor");
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const rootPath = activeWorkspace?.rootPath ?? null;
  const [fileChanges, setFileChanges] = useState<WorkspaceGitFileChange[]>([]);
  const [diffStatus, setDiffStatus] = useState<WorkspaceGitDiffStatus>("ok");
  const [isLoading, setIsLoading] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [scope, setScope] = useState<GitDiffScope>(GIT_DEFAULT_DIFF_SCOPE);
  const [diffStyle, setDiffStyle] = useState<GitDiffStyle>("unified");
  // The committed view: `null` until the user chooses one (toolbar toggle or a
  // deliberate panel-divider drag), at which point it pins. Render falls back to
  // the default list while still null.
  const [manualViewMode, setManualViewMode] = useState<GitViewMode | null>(
    null,
  );
  // True only while the user actively drags the right panel's outer divider, so
  // the width-driven switch below ignores maximize / fullscreen / window resize.
  const isRightPanelResizing = useAtomValue(rightPanelResizingAtom);
  // Panel width is synced from the DOM (external system) via a ResizeObserver.
  // On each change we only re-pick list/tree when the change came from a user
  // drag; otherwise the current view is preserved.
  const containerRef = useGitChangesAutoViewMode(
    isRightPanelResizing,
    setManualViewMode,
  );
  const viewMode = manualViewMode ?? GIT_DEFAULT_VIEW_MODE;
  const [changeTypeFilter, setChangeTypeFilter] =
    useState<GitChangeTypeFilter>("all");
  // Switching views remounts every per-file diff (list) or the Pierre tree
  // host (tree), which is heavy on the main thread. Mark it as a transition so
  // the toggle button stays responsive while the new view renders in the
  // background instead of blocking the click.
  const handleViewModeChange = useCallback((mode: GitViewMode) => {
    startTransition(() => setManualViewMode(mode));
  }, []);
  const [wrap, setWrap] = useState(false);
  // When on, pierre paints every unchanged line so the diff is read as a full
  // file with changes highlighted (not just hunks + expandable gaps).
  const [expandUnchanged, setExpandUnchanged] = useState(false);
  // Per-file collapse state, keyed by file path. A file is collapsed when its
  // path is present in the set; the toolbar fills/clears the whole set.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  // Build full-file diffs so pierre owns every line and can expand unchanged
  // context on demand (a partial patch leaves separators inert).
  const entries = useMemo(() => buildEntries(fileChanges), [fileChanges]);
  const changeTypeCounts = useMemo(
    () => computeChangeTypeCounts(entries),
    [entries],
  );
  const filteredEntries = useMemo(
    () => filterEntriesByChangeType(entries, changeTypeFilter),
    [entries, changeTypeFilter],
  );
  const stats = useMemo(
    () => computeDiffStats(filteredEntries),
    [filteredEntries],
  );
  const allCollapsed =
    filteredEntries.length > 0 &&
    filteredEntries.every((entry) => folded.has(entry.path));
  const stagedState = useMemo(
    () => computeStagedState(filteredEntries),
    [filteredEntries],
  );
  const actionsEnabled = isMutableScope(scope);
  const canDiscardAll = actionsEnabled && filteredEntries.length > 0;
  const currentBranch = branches.find((branch) => branch.current)?.name ?? null;

  // Toolbar toggle: collapse or expand every file at once.
  const handleCollapseAll = useCallback(
    (next: boolean) => {
      setFolded(
        next ? new Set(filteredEntries.map((entry) => entry.path)) : new Set(),
      );
    },
    [filteredEntries],
  );

  // Header chevron toggle: flip a single file's collapse state.
  const handleToggleFile = useCallback((key: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);
  const resolvedTheme = useResolvedTheme();
  const diffThemeType = resolvedTheme === "light" ? "light" : "dark";

  // Paths present in the last applied diff, so a reload can tell new files
  // (default collapsed) apart from known ones (keep the user's fold state).
  const knownPathsRef = useRef<ReadonlySet<string>>(new Set());
  // Monotonic sequence guarding against out-of-order responses when watcher
  // notifications, manual refreshes, and post-mutation reloads overlap: only
  // the most recently issued request may apply its result.
  const diffRequestSeqRef = useRef(0);
  const branchRequestSeqRef = useRef(0);
  const commitRequestSeqRef = useRef(0);
  // Always read the latest scope inside loadDiff so watcher reloads do not
  // capture a stale closure after the user switches modes.
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  // Sync: pull the current changes for the active workspace from the main
  // process. Each entry carries the full old/new contents for expandable diffs.
  const loadDiff = useCallback(
    async (path: string, options: { showLoading?: boolean } = {}) => {
      const showLoading = options.showLoading ?? true;
      const query = scopeToQuery(scopeRef.current);
      // Incomplete branch selection (menu just chose "branch") waits for
      // resolveBranchScope before loading.
      if (
        query.mode === "branch" &&
        (query.source.length === 0 || query.target.length === 0)
      ) {
        return;
      }
      if (query.mode === "commit" && query.commit.length === 0) {
        return;
      }
      const seq = ++diffRequestSeqRef.current;
      if (showLoading) setIsLoading(true);
      try {
        const result = await desktopApi.getWorkspaceGitDiff(path, query);
        if (seq !== diffRequestSeqRef.current) return;
        const { changes } = result;
        setDiffStatus(result.status);
        setFileChanges(changes);
        // Preserve fold state across reloads: files already in the list keep
        // whatever the user set; files that just appeared start collapsed.
        const known = knownPathsRef.current;
        setFolded(
          (prev) =>
            new Set(
              changes
                .filter(
                  (change) => !known.has(change.path) || prev.has(change.path),
                )
                .map((change) => change.path),
            ),
        );
        knownPathsRef.current = new Set(changes.map((change) => change.path));
      } catch {
        if (seq !== diffRequestSeqRef.current) return;
        setDiffStatus("error");
        setFileChanges([]);
        setFolded(new Set());
        knownPathsRef.current = new Set();
      } finally {
        if (showLoading && seq === diffRequestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  // Sync: pull local + remote refs for the branch compare selectors.
  const loadBranches = useCallback(async (path: string) => {
    const seq = ++branchRequestSeqRef.current;
    try {
      const next = await desktopApi.listGitBranches(path);
      if (seq !== branchRequestSeqRef.current) return;
      setBranches(next);
    } catch {
      if (seq !== branchRequestSeqRef.current) return;
      setBranches([]);
    }
  }, []);

  const loadCommits = useCallback(async (path: string) => {
    const seq = ++commitRequestSeqRef.current;
    setCommitsLoading(true);
    try {
      const next = await desktopApi.listGitCommits(path, { limit: 50 });
      if (seq !== commitRequestSeqRef.current) return;
      setCommits(next);
    } catch {
      if (seq !== commitRequestSeqRef.current) return;
      setCommits([]);
    } finally {
      if (seq === commitRequestSeqRef.current) {
        setCommitsLoading(false);
      }
    }
  }, []);

  const {
    handleCommitAction,
    handleGenerateCommitMessage,
    isCommitActionPending,
  } = useGitCommitActions({
    rootPath,
    loadBranches,
    loadCommits,
    loadDiff,
  });

  useSyncWorkspaceGitChanges({
    rootPath,
    loadDiff,
    loadBranches,
    setFileChanges,
    setBranches,
    setDiffStatus,
    setIsLoading,
    setIsActionPending,
  });

  const handleRefresh = useCallback(() => {
    if (!rootPath) return;
    void loadDiff(rootPath);
    void loadBranches(rootPath);
  }, [rootPath, loadDiff, loadBranches]);

  // Apply a new scope and reload the diff in the same turn. Updating scopeRef
  // first keeps loadDiff's query in sync without waiting for a re-render.
  const applyScope = useCallback(
    (next: GitDiffScope) => {
      scopeRef.current = next;
      setScope(next);
      if (rootPath) {
        void loadDiff(rootPath);
      }
    },
    [rootPath, loadDiff],
  );

  // Run a batched stage / unstage / discard over the given paths in a single
  // git invocation, then re-sync so staged state (and the diffs, after a
  // discard) reflect the new git state. Single-row actions pass one path; the
  // toolbar's "all" actions pass many — both pay one git spawn, not one per
  // file (which is what made "stage all" feel laggy).
  const runFileMutation = useCallback(
    async (
      action: (rootPath: string, filePaths: string[]) => Promise<void>,
      paths: string[],
    ) => {
      if (!rootPath || paths.length === 0) return;
      setIsActionPending(true);
      try {
        await action(rootPath, paths);
      } finally {
        await loadDiff(rootPath, { showLoading: false });
        setIsActionPending(false);
      }
    },
    [rootPath, loadDiff],
  );

  const handleStage = useCallback(
    (path: string) => void runFileMutation(desktopApi.stageGitFiles, [path]),
    [runFileMutation],
  );
  const handleUnstage = useCallback(
    (path: string) => void runFileMutation(desktopApi.unstageGitFiles, [path]),
    [runFileMutation],
  );
  const handleDiscard = useCallback(
    (path: string) => void runFileMutation(desktopApi.discardGitFiles, [path]),
    [runFileMutation],
  );

  const handleStageAll = useCallback(() => {
    const paths = filteredEntries
      .filter((entry) => entry.stagedState !== "staged")
      .map((entry) => entry.path);
    void runFileMutation(desktopApi.stageGitFiles, paths);
  }, [filteredEntries, runFileMutation]);

  const handleUnstageAll = useCallback(() => {
    const paths = filteredEntries
      .filter((entry) => entry.stagedState !== "unstaged")
      .map((entry) => entry.path);
    void runFileMutation(desktopApi.unstageGitFiles, paths);
  }, [filteredEntries, runFileMutation]);

  const handleDiscardAll = useCallback(() => {
    void runFileMutation(
      desktopApi.discardGitFiles,
      filteredEntries.map((entry) => entry.path),
    );
  }, [filteredEntries, runFileMutation]);

  const handleScopeChange = useCallback(
    (next: GitDiffScope) => {
      if (next.mode === "branch") {
        // Empty source/target means "enter branch mode" from the menu; fill
        // defaults. Non-empty means the user picked new refs.
        if (next.source.length > 0 && next.target.length > 0) {
          applyScope(next);
          return;
        }
        applyScope(resolveBranchScope(branches, scopeRef.current));
        return;
      }
      applyScope(next);
    },
    [applyScope, branches],
  );

  const handleOpenCommits = useCallback(() => {
    if (!rootPath) return;
    void loadCommits(rootPath);
  }, [rootPath, loadCommits]);

  if (!activeWorkspace) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-editor-monaco-bg px-6 text-center">
        <div className="space-y-2">
          <p className="text-sm text-editor-fg">
            {t("states.noWorkspaceTitle")}
          </p>
          <p className="text-xs leading-5 text-editor-fg-muted">
            {t("states.noWorkspaceDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        className="flex min-h-0 flex-1 flex-col bg-editor-monaco-bg"
        ref={containerRef}
      >
        <GitChangesToolbar
          additions={stats.additions}
          branches={branches}
          canDiscardAll={canDiscardAll}
          collapsed={allCollapsed}
          commits={commits}
          commitsLoading={commitsLoading}
          currentBranch={currentBranch}
          changeTypeCounts={changeTypeCounts}
          changeTypeFilter={changeTypeFilter}
          deletions={stats.deletions}
          diffStyle={diffStyle}
          fileCount={filteredEntries.length}
          hasChanges={entries.length > 0}
          isLoading={isLoading || isActionPending || isCommitActionPending}
          onChangeTypeFilterChange={setChangeTypeFilter}
          onCollapsedChange={handleCollapseAll}
          onDiffStyleChange={setDiffStyle}
          onDiscardAll={handleDiscardAll}
          onOpenCommits={handleOpenCommits}
          onRefresh={handleRefresh}
          onScopeChange={handleScopeChange}
          onStageAll={handleStageAll}
          onUnstageAll={handleUnstageAll}
          onCommitAction={handleCommitAction}
          onGenerateCommitMessage={handleGenerateCommitMessage}
          onExpandUnchangedChange={setExpandUnchanged}
          onViewModeChange={handleViewModeChange}
          onWrapChange={setWrap}
          expandUnchanged={expandUnchanged}
          scope={scope}
          stagedState={stagedState}
          viewMode={viewMode}
          wrap={wrap}
        />
        <GitChangesBody
          actionsEnabled={actionsEnabled}
          diffStatus={diffStatus}
          diffStyle={diffStyle}
          diffThemeType={diffThemeType}
          entries={filteredEntries}
          expandUnchanged={expandUnchanged}
          folded={folded}
          isFiltered={changeTypeFilter !== "all"}
          isLoading={isLoading}
          onDiscard={handleDiscard}
          onOpenFile={onOpenFile}
          onStage={handleStage}
          onToggleFile={handleToggleFile}
          onUnstage={handleUnstage}
          scopeMode={scope.mode}
          viewMode={viewMode}
          workspaceName={activeWorkspace.name}
          wrap={wrap}
        />
      </div>
    </TooltipProvider>
  );
}
