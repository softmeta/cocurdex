import type {
  AgentToolCallRecord,
  SessionRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  loadSessionMessagesAtom,
  loadSessionToolCallsAtom,
  loadTurnStatsAtom,
  messagesLoadedBySessionAtom,
  shouldRefreshSessionToolCalls,
  toolCallsLoadedBySessionAtom,
} from "@/features/agent";
import { loadTurnChangeSetsAtom } from "@/features/turn-workspace-changes";
import { activeBranchAtom, activeBranchesAtom } from "@/features/workspaces";
import { desktopApi, markSessionSwitch, measureSessionSwitch } from "@/lib";

// Records a perf mark + measurement whenever the active session (or its loaded
// transcript counts) changes. Pure telemetry against the performance API — no
// render-derivable value, so it lives in an effect-bearing custom hook.
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

// Loads the active session's messages and tool calls from the main process the
// first time the session is selected, hydrating the chat stores. Data fetch
// with cancellation — no fetching library here, so an effect is the seam.
export function useActiveSessionTranscript(
  activeSession: SessionRecord | undefined,
  messageCount: number,
  activeToolCalls: AgentToolCallRecord[],
) {
  const messagesLoadedBySession = useAtomValue(messagesLoadedBySessionAtom);
  const toolCallsLoadedBySession = useAtomValue(toolCallsLoadedBySessionAtom);
  const loadSessionMessages = useSetAtom(loadSessionMessagesAtom);
  const loadTurnStats = useSetAtom(loadTurnStatsAtom);
  const loadTurnChangeSets = useSetAtom(loadTurnChangeSetsAtom);
  const loadSessionToolCalls = useSetAtom(loadSessionToolCallsAtom);
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

    const messagesPromise = shouldLoadMessages
      ? desktopApi.listSessionMessages(sessionId).then((messages) => {
          markSessionSwitch(sessionId, "messages-ipc-end", {
            count: messages.messages.length,
          });
          measureSessionSwitch(
            sessionId,
            "messages-ipc",
            "transcript-load-start",
            "messages-ipc-end",
            { count: messages.messages.length },
          );
          return messages;
        })
      : Promise.resolve(null);
    const toolCallsPromise = shouldLoadToolCalls
      ? desktopApi.listSessionToolCalls(sessionId).then((toolCalls) => {
          markSessionSwitch(sessionId, "tool-calls-ipc-end", {
            count: toolCalls.length,
          });
          measureSessionSwitch(
            sessionId,
            "tool-calls-ipc",
            "transcript-load-start",
            "tool-calls-ipc-end",
            { count: toolCalls.length },
          );
          return toolCalls;
        })
      : Promise.resolve(null);

    void Promise.all([messagesPromise, toolCallsPromise])
      .then(([messages, toolCalls]) => {
        if (cancelled) {
          return;
        }

        markSessionSwitch(sessionId, "transcript-load-end", {
          messageCount: messages?.messages.length ?? messageCount,
          toolCallCount: toolCalls?.length ?? activeToolCalls.length,
        });
        measureSessionSwitch(
          sessionId,
          "transcript-ipc-total",
          "transcript-load-start",
          "transcript-load-end",
        );

        if (messages) {
          loadSessionMessages({ messages: messages.messages, sessionId });
          loadTurnStats(messages.turnStats);
          loadTurnChangeSets({
            changeSets: messages.turnChangeSets ?? {},
            sessionId,
          });
        }

        if (toolCalls) {
          loadSessionToolCalls({ sessionId, toolCalls });
        }
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
    messageCount,
    activeToolCalls,
    loadSessionMessages,
    loadTurnStats,
    loadTurnChangeSets,
    loadSessionToolCalls,
    messagesLoadedBySession,
    toolCallsLoadedBySession,
  ]);
}

// Syncs git branches to the active workspace via IPC. External system
// (git on disk) keyed on workspace identity — an effect with cancellation.
export function useGitBranches(activeWorkspace: WorkspaceRecord | undefined) {
  const setActiveBranches = useSetAtom(activeBranchesAtom);
  const setActiveBranch = useSetAtom(activeBranchAtom);

  useEffect(() => {
    if (!activeWorkspace) {
      setActiveBranches([]);
      setActiveBranch(null);
      return;
    }

    let cancelled = false;
    let requestSequence = 0;
    const rootPath = activeWorkspace.rootPath;

    const loadBranches = async () => {
      const request = ++requestSequence;
      try {
        const branches = await desktopApi.listGitBranches(rootPath);
        if (cancelled || request !== requestSequence) return;
        const localBranches = branches.filter(
          (branch) => branch.kind === "local" || branch.kind === "detached",
        );
        setActiveBranches(localBranches);
        const current = localBranches.find((branch) => branch.current);
        setActiveBranch(current?.name ?? null);
      } catch {
        if (cancelled || request !== requestSequence) return;
        setActiveBranches([]);
        setActiveBranch(null);
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
  }, [activeWorkspace, setActiveBranch, setActiveBranches]);
}
