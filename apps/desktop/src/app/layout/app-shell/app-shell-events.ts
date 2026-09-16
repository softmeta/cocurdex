import type { AgentEvent, DaemonEventMeta } from "@cocurdex/shared";
import { useSetAtom, useStore } from "jotai";
import { useEffect, useEffectEvent, useRef } from "react";
import { toast } from "sonner";
import {
  appendMessageAtom,
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
  markSessionMessageAtom,
  projectSubagentSessionFromToolCallAtom,
  reconcileSessionsAtom,
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
  const reconcileSessions = useSetAtom(reconcileSessionsAtom);
  const bootstrapQueuedInputs = useSetAtom(bootstrapQueuedInputsAtom);
  const bootstrapSessionUsage = useSetAtom(bootstrapSessionUsageAtom);
  const hydratePendingPermissions = useSetAtom(hydratePendingPermissionsAtom);
  const hydratePendingQuestions = useSetAtom(hydratePendingQuestionsAtom);
  const hydratePendingPlanApprovals = useSetAtom(
    hydratePendingPlanApprovalsAtom,
  );
  const appendMessage = useSetAtom(appendMessageAtom);
  const loadSessionMessages = useSetAtom(loadSessionMessagesAtom);
  const loadSessionToolCalls = useSetAtom(loadSessionToolCallsAtom);
  const loadTurnStats = useSetAtom(loadTurnStatsAtom);
  const loadTurnChangeSets = useSetAtom(loadTurnChangeSetsAtom);
  const store = useStore();

  const applyAgentEventToStores = useEffectEvent((event: AgentEvent) => {
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
  });

  // Replay-gap recovery: a dropped journaled event means event-sourced agent
  // state can be stale, so refetch one authoritative snapshot covering the
  // session list, queued inputs, usage, all pending interactions, and every
  // hydrated transcript. Live events arriving while a snapshot loads are
  // buffered; the snapshot's eventSeq boundary tells which of them it already
  // covers, and only newer ones are applied on top.
  const resyncRef = useRef({ running: false, again: false });
  const resyncBoundaryRef = useRef<{
    epoch: string | null;
    seq: number;
  } | null>(null);
  const bufferedAgentEventsRef = useRef<
    { event: AgentEvent; meta: DaemonEventMeta }[]
  >([]);

  const resyncOnce = async () => {
    const sessionIds = new Set<string>([
      ...Object.keys(store.get(messagesLoadedBySessionAtom)),
      ...Object.keys(store.get(toolCallsLoadedBySessionAtom)),
    ]);
    const activeSessionId = store.get(activeSessionIdAtom);
    if (activeSessionId) sessionIds.add(activeSessionId);
    const snapshot = await desktopApi.resyncApp([...sessionIds]);

    reconcileSessions(snapshot.sessions);
    bootstrapQueuedInputs({
      inputs: snapshot.queuedAgentInputs,
      messages: snapshot.queuedMessages,
    });
    bootstrapSessionUsage(snapshot.sessionUsage);
    hydratePendingPermissions(snapshot.interactions.permissions);
    hydratePendingQuestions(snapshot.interactions.questions);
    hydratePendingPlanApprovals(snapshot.interactions.planApprovals);
    for (const [sessionId, transcript] of Object.entries(
      snapshot.transcripts,
    )) {
      if (!transcript) continue;
      loadSessionMessages({ messages: transcript.messages, sessionId });
      // Active messages carry in-flight streamed content the durable list
      // lacks; upsert them after the durable merge so the daemon's
      // accumulation wins over locally diverged deltas.
      for (const message of transcript.activeMessages) {
        appendMessage(message);
      }
      loadTurnStats(transcript.turnStats);
      loadTurnChangeSets({
        changeSets: transcript.turnChangeSets,
        sessionId,
      });
      loadSessionToolCalls({ sessionId, toolCalls: transcript.toolCalls });
    }
    resyncBoundaryRef.current = {
      epoch: snapshot.epoch,
      seq: snapshot.eventSeq,
    };
  };

  const drainBufferedAgentEvents = () => {
    const buffered = bufferedAgentEventsRef.current;
    bufferedAgentEventsRef.current = [];
    const boundary = resyncBoundaryRef.current;
    for (const item of buffered) {
      const covered =
        boundary !== null &&
        item.meta.epoch === boundary.epoch &&
        item.meta.seq !== null &&
        item.meta.seq <= boundary.seq;
      if (!covered) applyAgentEventToStores(item.event);
    }
  };

  // Each gap or failed attempt schedules another pass; the loop ends once a
  // full snapshot completes with no gap pending.
  const runResync = useEffectEvent(async () => {
    let failures = 0;
    try {
      do {
        resyncRef.current.again = false;
        try {
          await resyncOnce();
          failures = 0;
        } catch (error) {
          failures += 1;
          console.error("[AgentEvent] resync attempt failed", error);
          if (failures >= 5) throw error;
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(500 * 2 ** (failures - 1), 4000)),
          );
          resyncRef.current.again = true;
          continue;
        }
        drainBufferedAgentEvents();
      } while (resyncRef.current.again);
    } catch (error) {
      console.error("[AgentEvent] resync abandoned after retries", error);
    } finally {
      resyncRef.current.running = false;
      drainBufferedAgentEvents();
      if (resyncRef.current.again) {
        resyncRef.current.running = true;
        void runResync();
      }
    }
  });

  const handleAgentEvent = useEffectEvent(
    (event: AgentEvent, meta?: DaemonEventMeta) => {
      if (resyncRef.current.running) {
        bufferedAgentEventsRef.current.push({
          event,
          meta: meta ?? { epoch: null, seq: null },
        });
        return;
      }
      applyAgentEventToStores(event);
    },
  );

  useEffect(() => taskApi.onAgentEvent(handleAgentEvent), []);
  useEffect(
    () =>
      desktopApi.onDataChanged((event) => {
        if (!event.areas.includes("agent")) return;
        resyncRef.current.again = true;
        if (resyncRef.current.running) return;
        resyncRef.current.running = true;
        void runResync();
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
