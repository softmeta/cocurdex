import type { AgentToolCallRecord, SessionRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  applyTranscriptPageAtom,
  messagesLoadedBySessionAtom,
  shouldRefreshSessionToolCalls,
  toolCallsLoadedBySessionAtom,
} from "@/features/agent";
import {
  activeWorktreesAtom,
  gitBranchesByRootAtom,
} from "@/features/workspaces";
import {
  desktopApi,
  type GitBranchInfo,
  markSessionSwitch,
  measureSessionSwitch,
} from "@/lib";

export function useSessionSwitchMetrics(
  activeSession: SessionRecord | undefined,
  activeSessionDataLoaded: boolean,
  messageCount: number,
  toolCallCount: number,
) {
  useEffect(() => {
    if (!activeSession) {
      return;
    }

    markSessionSwitch(activeSession.id, "active-session", {
      loaded: activeSessionDataLoaded,
      messageCount,
      toolCallCount,
    });
    measureSessionSwitch(
      activeSession.id,
      "click-to-active-session",
      "click",
      "active-session",
    );
  }, [activeSession, activeSessionDataLoaded, messageCount, toolCallCount]);
}

export function useActiveSessionTranscript(
  activeSession: SessionRecord | undefined,
  activeToolCalls: AgentToolCallRecord[],
) {
  const messagesLoadedBySession = useAtomValue(messagesLoadedBySessionAtom);
  const toolCallsLoadedBySession = useAtomValue(toolCallsLoadedBySessionAtom);
  const applyTranscriptPage = useSetAtom(applyTranscriptPageAtom);
  const reconciledTerminalSessions = useRef(new Set<string>());

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    const sessionId = activeSession.id;
    const shouldLoadMessages = !messagesLoadedBySession[sessionId];
    const toolCallsLoaded = Boolean(toolCallsLoadedBySession[sessionId]);
    if (activeSession.status === "running") {
      reconciledTerminalSessions.current.delete(sessionId);
    }
    const shouldReconcileTerminalToolCalls =
      shouldRefreshSessionToolCalls(
        activeSession.status,
        toolCallsLoaded,
        activeToolCalls,
      ) && !reconciledTerminalSessions.current.has(sessionId);
    const shouldLoadToolCalls =
      !toolCallsLoaded || shouldReconcileTerminalToolCalls;
    if (shouldReconcileTerminalToolCalls) {
      reconciledTerminalSessions.current.add(sessionId);
    }

    if (!shouldLoadMessages && !shouldLoadToolCalls) {
      return;
    }

    let cancelled = false;

    markSessionSwitch(sessionId, "transcript-load-start", {
      loadMessages: shouldLoadMessages,
      loadToolCalls: shouldLoadToolCalls,
    });

    void desktopApi
      .getTranscriptPage(sessionId, null)
      .then((page) => {
        if (cancelled) {
          return;
        }
        markSessionSwitch(sessionId, "transcript-load-end", {
          messageCount: page.messages.length,
          toolCallCount: page.toolCalls.length,
        });
        measureSessionSwitch(
          sessionId,
          "transcript-ipc-total",
          "transcript-load-start",
          "transcript-load-end",
        );
        applyTranscriptPage({ sessionId, page });
      })
      .catch((error) => {
        console.error("[CenterPanel] load active session transcript failed", {
          error,
          sessionId,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSession,
    activeToolCalls,
    applyTranscriptPage,
    messagesLoadedBySession,
    toolCallsLoadedBySession,
  ]);
}

export function useGitBranches(rootPath: string | undefined) {
  const branchesByRoot = useAtomValue(gitBranchesByRootAtom);
  const setBranchesByRoot = useSetAtom(gitBranchesByRootAtom);

  useEffect(() => {
    if (!rootPath) {
      return;
    }

    let cancelled = false;
    let requestSequence = 0;
    const storeBranches = (branches: GitBranchInfo[]) =>
      setBranchesByRoot((current) => ({ ...current, [rootPath]: branches }));

    const loadBranches = async () => {
      const request = ++requestSequence;
      try {
        const branches = await desktopApi.listGitBranches(rootPath);
        if (cancelled || request !== requestSequence) return;
        storeBranches(
          branches.filter(
            (branch) => branch.kind === "local" || branch.kind === "detached",
          ),
        );
      } catch {
        if (cancelled || request !== requestSequence) return;
        storeBranches([]);
      }
    };

    void loadBranches();

    const unsubscribeGit = desktopApi.onWorkspaceGitStateChanged((event) => {
      if (event.rootPath !== rootPath) return;
      void loadBranches();
    });

    return () => {
      cancelled = true;
      unsubscribeGit();
    };
  }, [rootPath, setBranchesByRoot]);

  const activeBranches = rootPath ? branchesByRoot[rootPath] : [];
  const activeBranch = activeBranches
    ? (activeBranches.find((branch) => branch.current)?.name ?? null)
    : undefined;
  return { activeBranches: activeBranches ?? [], activeBranch };
}

export function useGitWorktrees(workspaceRootPath: string | undefined) {
  const setActiveWorktrees = useSetAtom(activeWorktreesAtom);

  useEffect(() => {
    if (!workspaceRootPath) {
      setActiveWorktrees([]);
      return;
    }

    let cancelled = false;
    let requestSequence = 0;
    const rootPath = workspaceRootPath;

    const loadWorktrees = async () => {
      const request = ++requestSequence;
      try {
        const worktrees = await desktopApi.listGitWorktrees(rootPath);
        if (cancelled || request !== requestSequence) return;
        setActiveWorktrees(worktrees);
      } catch {
        if (cancelled || request !== requestSequence) return;
        setActiveWorktrees([]);
      }
    };

    void loadWorktrees();

    const unsubscribeGit = desktopApi.onWorkspaceGitStateChanged((event) => {
      if (event.rootPath !== rootPath) return;
      void loadWorktrees();
    });

    return () => {
      cancelled = true;
      unsubscribeGit();
    };
  }, [setActiveWorktrees, workspaceRootPath]);
}
