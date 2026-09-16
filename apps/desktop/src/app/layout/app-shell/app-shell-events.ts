import { useSetAtom, useStore } from "jotai";
import { useEffect, useEffectEvent } from "react";
import { toast } from "sonner";
import {
  applyAgentEventAtom,
  applyAgentRuntimeEventAtom,
  applyPermissionEventAtom,
  applyPlanApprovalEventAtom,
  applyPlanEventAtom,
  applyQuestionEventAtom,
  applyQueuedInputEventAtom,
  applyToolEventAtom,
  bootstrapQueuedInputsAtom,
  hydratePendingPermissionsAtom,
  hydratePendingPlanApprovalsAtom,
  hydratePendingQuestionsAtom,
  loadSessionMessagesAtom,
  loadSessionToolCallsAtom,
  loadTurnStatsAtom,
  messagesLoadedBySessionAtom,
  toolCallsLoadedBySessionAtom,
} from "@/features/agent";
import { addAnnotationAtom, receiveBrowserTabsAtom } from "@/features/browser";
import {
  applyContextBreakdownEventAtom,
  applyRateLimitsEventAtom,
  applyUsageEventAtom,
  bootstrapSessionUsageAtom,
} from "@/features/composer";
import { editorPanelOpenAtom } from "@/features/editor";
import {
  activeSessionIdAtom,
  bootstrapSessionsAtom,
  markSessionMessageAtom,
  projectSubagentSessionFromToolCallAtom,
  updateSessionStatusAtom,
  updateSessionTitleAtom,
  upsertSessionAtom,
} from "@/features/sessions";
import {
  applyTurnChangesEventAtom,
  loadTurnChangeSetsAtom,
} from "@/features/turn-workspace-changes";
import { desktopApi, onOpenHtmlPreview, taskApi, useMountEffect } from "@/lib";
import { bumpRightPanelRevealAtom } from "../right-panel-reveal";

export function useAgentEventBridge() {
  const applyAgentEvent = useSetAtom(applyAgentEventAtom);
  const applyQueuedInputEvent = useSetAtom(applyQueuedInputEventAtom);
  const applyAgentRuntimeEvent = useSetAtom(applyAgentRuntimeEventAtom);
  const applyPermissionEvent = useSetAtom(applyPermissionEventAtom);
  const applyPlanApprovalEvent = useSetAtom(applyPlanApprovalEventAtom);
  const applyPlanEvent = useSetAtom(applyPlanEventAtom);
  const applyQuestionEvent = useSetAtom(applyQuestionEventAtom);
  const applyToolEvent = useSetAtom(applyToolEventAtom);
  const applyTurnChangesEvent = useSetAtom(applyTurnChangesEventAtom);
  const applyUsageEvent = useSetAtom(applyUsageEventAtom);
  const applyRateLimitsEvent = useSetAtom(applyRateLimitsEventAtom);
  const applyContextBreakdownEvent = useSetAtom(applyContextBreakdownEventAtom);
  const updateSessionStatus = useSetAtom(updateSessionStatusAtom);
  const updateSessionTitle = useSetAtom(updateSessionTitleAtom);
  const markSessionMessage = useSetAtom(markSessionMessageAtom);
  const upsertSession = useSetAtom(upsertSessionAtom);
  const projectSubagentSession = useSetAtom(
    projectSubagentSessionFromToolCallAtom,
  );
  const bootstrapSessions = useSetAtom(bootstrapSessionsAtom);
  const bootstrapQueuedInputs = useSetAtom(bootstrapQueuedInputsAtom);
  const bootstrapSessionUsage = useSetAtom(bootstrapSessionUsageAtom);
  const hydratePendingPermissions = useSetAtom(hydratePendingPermissionsAtom);
  const hydratePendingQuestions = useSetAtom(hydratePendingQuestionsAtom);
  const hydratePendingPlanApprovals = useSetAtom(
    hydratePendingPlanApprovalsAtom,
  );
  const loadSessionMessages = useSetAtom(loadSessionMessagesAtom);
  const loadSessionToolCalls = useSetAtom(loadSessionToolCallsAtom);
  const loadTurnStats = useSetAtom(loadTurnStatsAtom);
  const loadTurnChangeSets = useSetAtom(loadTurnChangeSetsAtom);
  const store = useStore();

  // Replay-gap recovery: a dropped journaled event means event-sourced agent
  // state can be stale, so refetch every authoritative snapshot — the session
  // list, queued inputs, usage, all pending interactions, and the transcripts
  // already hydrated in memory.
  const resyncAgentState = useEffectEvent(async () => {
    try {
      const data = await desktopApi.bootstrapApp();
      bootstrapSessions(data.sessions);
      bootstrapQueuedInputs({
        inputs: data.queuedAgentInputs,
        messages: data.queuedMessages,
      });
      bootstrapSessionUsage(data.sessionUsage);

      const interactions = await taskApi.listPendingInteractions();
      hydratePendingPermissions(interactions.permissions);
      hydratePendingQuestions(interactions.questions);
      hydratePendingPlanApprovals(interactions.planApprovals);

      const sessionIds = new Set<string>([
        ...Object.keys(store.get(messagesLoadedBySessionAtom)),
        ...Object.keys(store.get(toolCallsLoadedBySessionAtom)),
      ]);
      const activeSessionId = store.get(activeSessionIdAtom);
      if (activeSessionId) sessionIds.add(activeSessionId);
      await Promise.all(
        [...sessionIds].map(async (sessionId) => {
          try {
            const [messages, toolCalls] = await Promise.all([
              desktopApi.listSessionMessages(sessionId),
              desktopApi.listSessionToolCalls(sessionId),
            ]);
            loadSessionMessages({ messages: messages.messages, sessionId });
            loadTurnStats(messages.turnStats);
            loadTurnChangeSets({
              changeSets: messages.turnChangeSets ?? {},
              sessionId,
            });
            loadSessionToolCalls({ sessionId, toolCalls });
          } catch (error) {
            console.error("[AgentEvent] session resync failed", {
              error,
              sessionId,
            });
          }
        }),
      );
    } catch (error) {
      console.error("[AgentEvent] resync failed", error);
    }
  });

  const handleAgentEvent = useEffectEvent(
    (
      event: Parameters<typeof taskApi.onAgentEvent>[0] extends (
        payload: infer T,
      ) => void
        ? T
        : never,
    ) => {
      applyAgentEvent(event);
      applyQueuedInputEvent(event);
      applyAgentRuntimeEvent(event);
      applyPermissionEvent(event);
      applyPlanApprovalEvent(event);
      applyPlanEvent(event);
      applyQuestionEvent(event);
      applyToolEvent(event);
      applyTurnChangesEvent(event);
      applyUsageEvent(event);
      applyRateLimitsEvent(event);
      applyContextBreakdownEvent(event);

      if (event.type === "session.upserted") {
        upsertSession(event.session);
        return;
      }

      if (event.type === "session.title.updated") {
        updateSessionTitle({
          sessionId: event.sessionId,
          title: event.title,
          expectedTitle: event.expectedTitle,
          updatedAt: event.updatedAt,
        });
        return;
      }

      if (event.type === "state.changed") {
        updateSessionStatus({
          sessionId: event.sessionId,
          status: event.status,
        });
        return;
      }

      if (event.type === "message.completed") {
        markSessionMessage({
          sessionId: event.sessionId,
          createdAt: event.message.createdAt,
        });
        return;
      }

      if (
        event.type === "tool.started" ||
        event.type === "tool.updated" ||
        event.type === "tool.finished"
      ) {
        projectSubagentSession(event.toolCall);
        return;
      }

      if (event.type === "error") {
        console.error("[AgentEvent] error", {
          error: event.message,
          sessionId: event.sessionId,
        });
        updateSessionStatus({
          sessionId: event.sessionId,
          status: "error",
        });
        markSessionMessage({
          sessionId: event.sessionId,
          createdAt: new Date().toISOString(),
        });
      }
    },
  );

  useEffect(() => taskApi.onAgentEvent(handleAgentEvent), []);
  useEffect(
    () =>
      desktopApi.onDataChanged((event) => {
        if (event.areas.includes("agent")) void resyncAgentState();
      }),
    [],
  );
}

export function useBrowserEventBridge() {
  const setEditorPanelOpen = useSetAtom(editorPanelOpenAtom);
  const revealPanel = useSetAtom(bumpRightPanelRevealAtom);
  const receiveTabs = useSetAtom(receiveBrowserTabsAtom);
  const addAnnotation = useSetAtom(addAnnotationAtom);
  const open = useEffectEvent(
    (
      html: string,
      resolve: (url: string | null) => void,
      sourceId: string,
      streaming: boolean,
    ) => {
      setEditorPanelOpen(true);
      revealPanel("browser");
      void desktopApi
        .browserOpenHtml(html, sourceId, streaming)
        .then(resolve)
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error));
          resolve(null);
        });
    },
  );
  useMountEffect(() => {
    let received = false;
    let disposed = false;
    const unsubscribeTabs = desktopApi.onBrowserTabs((snapshot) => {
      received = true;
      receiveTabs(snapshot);
    });
    void desktopApi.browserListTabs().then((snapshot) => {
      if (!received && !disposed) receiveTabs(snapshot);
    });
    const unsubscribeHtml = onOpenHtmlPreview(
      (html, resolve, sourceId, streaming) =>
        open(html, resolve, sourceId, streaming),
    );
    const unsubscribeAnnotation = desktopApi.onBrowserAnnotation(
      ({ tabId, annotation }) => addAnnotation(annotation, tabId),
    );
    return () => {
      disposed = true;
      unsubscribeTabs();
      unsubscribeHtml();
      unsubscribeAnnotation();
    };
  });
}
