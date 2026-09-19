import type { TurnChangeSet } from "@cocurdex/shared";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSessionMessages } from "@/features/agent/view/use-session-messages";
import {
  activeSessionIdAtom,
  collectSessionSubtreeIds,
  sessionsAtom,
} from "@/features/sessions";
import {
  activeWorkingPathAtom,
  activeWorkspaceIdAtom,
  workspacesAtom,
} from "@/features/workspaces";
import type {
  GitBranchInfo,
  GitCommitInfo,
  WorkspaceGitDiffStatus,
  WorkspaceGitFileChange,
} from "@/lib";
import { desktopApi, useResolvedTheme } from "@/lib";
import { GitChangesBody } from "./git-changes-body";
import {
  buildEntries,
  computeChangeTypeCounts,
  computeDiffStats,
  computeStagedState,
  filterEntriesByChangeType,
  type GitChangeTypeFilter,
  toGitFileChangesFromTurn,
} from "./git-changes-model";
import { gitDiffScopeAtom, gitRevealAtom } from "./git-changes-store";
import { useSyncWorkspaceGitChanges } from "./git-changes-sync";
import { GitChangesToolbar, type GitDiffStyle } from "./git-changes-toolbar";
import {
  type GitDiffScope,
  isMutableScope,
  resolveBranchScope,
  resolveTurnScope,
  scopeForActiveSession,
  scopeKey,
  scopeToQuery,
  turnChangeSetKey,
} from "./git-diff-scope";
import { turnListTitle } from "./git-turn-label";
import { useGitCommitActions } from "./use-git-commit-actions";

export interface GitChangesProps {
  onOpenFile: (path: string) => void;
}

export function GitChanges({ onOpenFile }: GitChangesProps) {
  const { t } = useTranslation("editor");
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const workingPath = useAtomValue(activeWorkingPathAtom);
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const rootPath = workingPath ?? activeWorkspace?.rootPaths[0] ?? null;
  const [fileChanges, setFileChanges] = useState<WorkspaceGitFileChange[]>([]);
  const [diffStatus, setDiffStatus] = useState<WorkspaceGitDiffStatus>("ok");
  const [isLoading, setIsLoading] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [scope, setScope] = useAtom(gitDiffScopeAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const sessions = useAtomValue(sessionsAtom);
  const allowedTurnSessionIds = activeSessionId
    ? collectSessionSubtreeIds(sessions, activeSessionId)
    : null;
  const activeScope = scopeForActiveSession(scope, allowedTurnSessionIds);
  if (activeScope !== scope) {
    setScope(activeScope);
  }
  const sessionMessages = useSessionMessages(activeSessionId);
  const [turns, setTurns] = useState<TurnChangeSet[]>([]);
  const turnsSessionIdRef = useRef(activeSessionId);
  if (turnsSessionIdRef.current !== activeSessionId) {
    turnsSessionIdRef.current = activeSessionId;
    setTurns([]);
  }
  const [turnsLoading, setTurnsLoading] = useState(false);
  const [turnEmptyReason, setTurnEmptyReason] = useState<
    "none" | "expired" | "missing" | null
  >(null);
  const [diffStyle, setDiffStyle] = useState<GitDiffStyle>("unified");
  const [changeTypeFilter, setChangeTypeFilter] =
    useState<GitChangeTypeFilter>("all");
  const [wrap, setWrap] = useState(false);
  // When on, pierre paints every unchanged line so the diff is read as a full
  // file with changes highlighted (not just hunks + expandable gaps).
  const [expandUnchanged, setExpandUnchanged] = useState(false);
  // Per-file collapse state, keyed by file path. A file is collapsed when its
  // path is present in the set; a collapse is explicit intent and survives
  // reloads and viewport-driven mounting.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  // The file index is collapsible so the diffs can take the full panel width.
  const [treePanelVisible, setTreePanelVisible] = useState(true);
  const reveal = useAtomValue(gitRevealAtom);
  const [appliedRevealToken, setAppliedRevealToken] = useState(0);

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

  // A reveal target the change-type filter hides must still be reachable. The
  // rest of the reveal — unfolding, scrolling, mounting — belongs to the diff
  // stack, which consumes the request.
  if (reveal && reveal.token !== appliedRevealToken) {
    setAppliedRevealToken(reveal.token);
    const filteredOut = !filteredEntries.some(
      (entry) => entry.path === reveal.path,
    );
    if (changeTypeFilter !== "all" && filteredOut) {
      setChangeTypeFilter("all");
    }
  }
  const stats = useMemo(
    () => computeDiffStats(filteredEntries),
    [filteredEntries],
  );
  const stagedState = useMemo(
    () => computeStagedState(filteredEntries),
    [filteredEntries],
  );
  const turnLabels = useMemo(() => {
    const prompts = new Map<string, string>();
    for (const message of sessionMessages) {
      if (message.role === "user") {
        prompts.set(message.id, message.content);
      }
    }
    const labels: Record<string, string> = {};
    for (const turn of turns) {
      labels[turnChangeSetKey(turn)] = turnListTitle(
        turn,
        prompts.get(turn.userMessageId) ?? "",
      );
    }
    return labels;
  }, [sessionMessages, turns]);

  const actionsEnabled = isMutableScope(activeScope);
  const canDiscardAll = actionsEnabled && filteredEntries.length > 0;
  const currentBranch = branches.find((branch) => branch.current)?.name ?? null;

  // Header chevron toggle: a folded file opens, an open file shuts, and a file
  // the stack has not mounted yet just opens.
  const handleFoldFile = useCallback((path: string) => {
    setFolded((prev) => (prev.has(path) ? prev : new Set(prev).add(path)));
  }, []);

  const handleUnfoldFile = useCallback((path: string) => {
    setFolded((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const resolvedTheme = useResolvedTheme();
  const diffThemeType = resolvedTheme === "light" ? "light" : "dark";

  // Monotonic sequence guarding against out-of-order responses when watcher
  // notifications, manual refreshes, and post-mutation reloads overlap: only
  // the most recently issued request may apply its result.
  const diffRequestSeqRef = useRef(0);
  const loadingDiffCountRef = useRef(0);
  const branchRequestSeqRef = useRef(0);
  const commitRequestSeqRef = useRef(0);
  const turnRequestSeqRef = useRef(0);
  const scopeRef = useRef(activeScope);
  scopeRef.current = activeScope;

  // Sync: pull the current changes for the active workspace from the main
  // process. Each entry carries the full old/new contents for expandable diffs.
  const loadDiff = useCallback(
    async (path: string, options: { showLoading?: boolean } = {}) => {
      const showLoading = options.showLoading ?? true;
      const currentScope = scopeRef.current;
      if (currentScope.mode === "turn") {
        if (!currentScope.sessionId || !currentScope.messageId) {
          setFileChanges([]);
          setDiffStatus("ok");
          setTurnEmptyReason("none");
          setFolded(new Set());
          if (showLoading) setIsLoading(false);
          return;
        }
        const seq = ++diffRequestSeqRef.current;
        if (showLoading) {
          loadingDiffCountRef.current += 1;
          setIsLoading(true);
        }
        try {
          const [result, nextTurns] = await Promise.all([
            desktopApi.getTurnChangeDiff({
              sessionId: currentScope.sessionId,
              messageId: currentScope.messageId,
            }),
            desktopApi.listTurnChangeSets(currentScope.sessionId),
          ]);
          if (seq !== diffRequestSeqRef.current) return;
          setTurns(nextTurns);
          const changes = toGitFileChangesFromTurn(result.files);
          setDiffStatus(result.status === "error" ? "error" : "ok");
          setFileChanges(changes);
          if (result.status === "expired") {
            setTurnEmptyReason("expired");
          } else if (result.status === "missing") {
            setTurnEmptyReason("missing");
          } else {
            setTurnEmptyReason(null);
          }
          // Read state survives a reload for files still in the list.
          setFolded(
            (prev) =>
              new Set(
                changes
                  .filter((change) => prev.has(change.path))
                  .map((change) => change.path),
              ),
          );
        } catch {
          if (seq !== diffRequestSeqRef.current) return;
          setDiffStatus("error");
          setFileChanges([]);
          setTurnEmptyReason(null);
          setFolded(new Set());
        } finally {
          if (showLoading) {
            loadingDiffCountRef.current -= 1;
            if (loadingDiffCountRef.current === 0) setIsLoading(false);
          }
        }
        return;
      }
      const query = scopeToQuery(currentScope);
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
      if (showLoading) {
        loadingDiffCountRef.current += 1;
        setIsLoading(true);
      }
      try {
        const result = await desktopApi.getWorkspaceGitDiff(path, query);
        if (seq !== diffRequestSeqRef.current) return;
        const { changes } = result;
        setDiffStatus(result.status);
        setTurnEmptyReason(null);
        setFileChanges(changes);
        // Preserve read state across reloads: files already in the list keep
        // whatever the user set.
        setFolded(
          (prev) =>
            new Set(
              changes
                .filter((change) => prev.has(change.path))
                .map((change) => change.path),
            ),
        );
      } catch {
        if (seq !== diffRequestSeqRef.current) return;
        setDiffStatus("error");
        setFileChanges([]);
        setFolded(new Set());
      } finally {
        if (showLoading) {
          loadingDiffCountRef.current -= 1;
          if (loadingDiffCountRef.current === 0) setIsLoading(false);
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

  const loadTurns = useCallback(async (sessionId: string) => {
    const seq = ++turnRequestSeqRef.current;
    setTurnsLoading(true);
    try {
      const next = await desktopApi.listTurnChangeSets(sessionId);
      if (seq !== turnRequestSeqRef.current) return;
      setTurns(next);
    } catch {
      if (seq !== turnRequestSeqRef.current) return;
      setTurns([]);
    } finally {
      if (seq === turnRequestSeqRef.current) {
        setTurnsLoading(false);
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
    scopeKey: scopeKey(activeScope),
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
    },
    [setScope],
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
        if (next.source.length > 0 && next.target.length > 0) {
          applyScope(next);
          return;
        }
        applyScope(resolveBranchScope(branches, scopeRef.current));
        return;
      }
      if (next.mode === "turn") {
        if (next.messageId.length > 0) {
          applyScope(next);
          return;
        }
        applyScope(
          resolveTurnScope(activeSessionId ?? "", turns, scopeRef.current),
        );
        return;
      }
      applyScope(next);
    },
    [activeSessionId, applyScope, branches, turns],
  );

  const handleOpenCommits = useCallback(() => {
    if (!rootPath) return;
    void loadCommits(rootPath);
  }, [rootPath, loadCommits]);

  const handleOpenTurns = useCallback(() => {
    if (!activeSessionId) return;
    void loadTurns(activeSessionId);
  }, [activeSessionId, loadTurns]);

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
      <div className="flex min-h-0 flex-1 flex-col bg-editor-monaco-bg">
        <GitChangesToolbar
          additions={stats.additions}
          branches={branches}
          canDiscardAll={canDiscardAll}
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
          onDiffStyleChange={setDiffStyle}
          onDiscardAll={handleDiscardAll}
          onOpenCommits={handleOpenCommits}
          sessionId={activeSessionId}
          onOpenTurns={handleOpenTurns}
          onRefresh={handleRefresh}
          onScopeChange={handleScopeChange}
          onStageAll={handleStageAll}
          onUnstageAll={handleUnstageAll}
          onCommitAction={handleCommitAction}
          onGenerateCommitMessage={handleGenerateCommitMessage}
          onExpandUnchangedChange={setExpandUnchanged}
          onTreePanelVisibleChange={setTreePanelVisible}
          onWrapChange={setWrap}
          expandUnchanged={expandUnchanged}
          scope={activeScope}
          stagedState={stagedState}
          turnLabels={turnLabels}
          turns={turns}
          turnsLoading={turnsLoading}
          treePanelVisible={treePanelVisible}
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
          onFold={handleFoldFile}
          onOpenFile={onOpenFile}
          onStage={handleStage}
          onUnfold={handleUnfoldFile}
          onUnstage={handleUnstage}
          reveal={reveal}
          turnEmptyReason={turnEmptyReason}
          scopeMode={activeScope.mode}
          treePanelVisible={treePanelVisible}
          workspaceName={activeWorkspace.name}
          wrap={wrap}
        />
      </div>
    </TooltipProvider>
  );
}
