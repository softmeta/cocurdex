import type { AgentEvent, DaemonEventMeta } from "@cocurdex/shared";
import { getDefaultStore } from "jotai";
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
  loadSessionPlanAtom,
  loadSessionToolCallsAtom,
  loadTurnStatsAtom,
  messagesLoadedBySessionAtom,
  toolCallsLoadedBySessionAtom,
} from "@/features/agent";
import {
  applyContextBreakdownEventAtom,
  applyRateLimitsEventAtom,
  applyUsageEventAtom,
  bootstrapSessionUsageAtom,
} from "@/features/composer";
import {
  activeSessionIdAtom,
  applyRuntimeSessionModesAtom,
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
import { desktopApi, taskApi } from "@/lib";

type Store = ReturnType<typeof getDefaultStore>;

const EVENT_APPLIERS = [
  applyAgentEventAtom,
  applyQueuedInputEventAtom,
  applyAgentRuntimeEventAtom,
  applyRuntimeSessionModesAtom,
  applyPermissionEventAtom,
  applyPlanApprovalEventAtom,
  applyPlanEventAtom,
  applyQuestionEventAtom,
  applyToolEventAtom,
  applyTurnChangesEventAtom,
  applyUsageEventAtom,
  applyRateLimitsEventAtom,
  applyContextBreakdownEventAtom,
] as const;

function applyAgentEventToStore(store: Store, event: AgentEvent) {
  for (const applier of EVENT_APPLIERS) store.set(applier, event);

  if (event.type === "session.upserted") {
    store.set(upsertSessionAtom, event.session);
    return;
  }

  if (event.type === "session.title.updated") {
    store.set(updateSessionTitleAtom, {
      sessionId: event.sessionId,
      title: event.title,
      expectedTitle: event.expectedTitle,
      updatedAt: event.updatedAt,
    });
    return;
  }

  if (event.type === "state.changed") {
    store.set(updateSessionStatusAtom, {
      sessionId: event.sessionId,
      status: event.status,
    });
    return;
  }

  if (event.type === "message.completed") {
    store.set(markSessionMessageAtom, {
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
    store.set(projectSubagentSessionFromToolCallAtom, event.toolCall);
    return;
  }

  if (event.type === "error") {
    console.error("[AgentEvent] error", {
      error: event.message,
      sessionId: event.sessionId,
    });
    store.set(updateSessionStatusAtom, {
      sessionId: event.sessionId,
      status: "error",
    });
    store.set(markSessionMessageAtom, {
      sessionId: event.sessionId,
      createdAt: new Date().toISOString(),
    });
  }
}

// Replay-gap recovery: a dropped journaled event means event-sourced agent
// state can be stale, so refetch one authoritative snapshot covering the
// session list, queued inputs, usage, all pending interactions, and every
// hydrated transcript. Live events arriving while a snapshot loads are
// buffered; the snapshot's eventSeq boundary tells which of them it already
// covers, and only newer ones are applied on top.
export function createAgentEventBridge(store: Store) {
  const resync = { running: false, again: false };
  let resyncPromise: Promise<void> | null = null;
  const requestedSessionIds = new Set<string>();
  let boundary: { epoch: string | null; seq: number } | null = null;
  let buffered: { event: AgentEvent; meta: DaemonEventMeta }[] = [];

  const resyncOnce = async () => {
    const sessionIds = new Set<string>([
      ...requestedSessionIds,
      ...Object.keys(store.get(messagesLoadedBySessionAtom)),
      ...Object.keys(store.get(toolCallsLoadedBySessionAtom)),
    ]);
    const activeSessionId = store.get(activeSessionIdAtom);
    if (activeSessionId) sessionIds.add(activeSessionId);
    const snapshot = await desktopApi.resyncApp([...sessionIds]);

    store.set(reconcileSessionsAtom, snapshot.sessions);
    store.set(bootstrapQueuedInputsAtom, {
      inputs: snapshot.queuedAgentInputs,
      messages: snapshot.queuedMessages,
    });
    store.set(bootstrapSessionUsageAtom, snapshot.sessionUsage);
    store.set(hydratePendingPermissionsAtom, snapshot.interactions.permissions);
    store.set(hydratePendingQuestionsAtom, snapshot.interactions.questions);
    store.set(
      hydratePendingPlanApprovalsAtom,
      snapshot.interactions.planApprovals,
    );
    for (const [sessionId, transcript] of Object.entries(
      snapshot.transcripts,
    )) {
      if (!transcript) continue;
      store.set(loadSessionMessagesAtom, {
        messages: transcript.messages,
        sessionId,
      });
      // Active messages carry in-flight streamed content the durable list
      // lacks; upsert them after the durable merge so the daemon's
      // accumulation wins over locally diverged deltas.
      for (const message of transcript.activeMessages) {
        store.set(appendMessageAtom, message);
      }
      store.set(loadTurnStatsAtom, transcript.turnStats);
      store.set(loadTurnChangeSetsAtom, {
        changeSets: transcript.turnChangeSets,
        sessionId,
      });
      store.set(loadSessionToolCallsAtom, {
        sessionId,
        toolCalls: transcript.toolCalls,
      });
      store.set(loadSessionPlanAtom, { sessionId, plan: transcript.plan });
    }
    boundary = { epoch: snapshot.epoch, seq: snapshot.eventSeq };
  };

  const drainBufferedEvents = () => {
    const pending = buffered;
    buffered = [];
    for (const item of pending) {
      const covered =
        boundary !== null &&
        item.meta.epoch === boundary.epoch &&
        item.meta.seq !== null &&
        item.meta.seq <= boundary.seq;
      if (!covered) applyAgentEventToStore(store, item.event);
    }
  };

  // Each gap or failed attempt schedules another pass; the loop ends once a
  // full snapshot completes with no gap pending.
  const runResync = async () => {
    let failures = 0;
    try {
      do {
        resync.again = false;
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
          resync.again = true;
          continue;
        }
        drainBufferedEvents();
      } while (resync.again);
    } catch (error) {
      console.error("[AgentEvent] resync abandoned after retries", error);
      throw error;
    } finally {
      resync.running = false;
      drainBufferedEvents();
    }
  };

  const synchronize = (sessionIds: string[] = []) => {
    for (const id of sessionIds) requestedSessionIds.add(id);
    resync.again = true;
    if (!resyncPromise) {
      resync.running = true;
      resyncPromise = runResync().finally(() => {
        resyncPromise = null;
      });
    }
    return resyncPromise;
  };

  const handleAgentEvent = (event: AgentEvent, meta?: DaemonEventMeta) => {
    if (resync.running) {
      buffered.push({ event, meta: meta ?? { epoch: null, seq: null } });
      return;
    }
    applyAgentEventToStore(store, event);
  };

  const start = () => {
    const unsubscribeEvents = taskApi.onAgentEvent(handleAgentEvent);
    const unsubscribeData = desktopApi.onDataChanged((event) => {
      if (!event.areas.includes("agent")) return;
      void synchronize().catch(console.error);
    });
    return () => {
      unsubscribeEvents();
      unsubscribeData();
    };
  };

  return { start, synchronize };
}

const ACTIVE_BRIDGE = Symbol.for("cocurdex.agentEventBridge");
type BridgeHost = typeof globalThis & { [ACTIVE_BRIDGE]?: () => void };

const defaultBridge = createAgentEventBridge(getDefaultStore());

export function startAgentEventBridge() {
  const host = globalThis as BridgeHost;
  host[ACTIVE_BRIDGE]?.();
  host[ACTIVE_BRIDGE] = defaultBridge.start();
}

export function synchronizeAgentState(sessionIds?: string[]) {
  return defaultBridge.synchronize(sessionIds);
}

if (import.meta.hot?.data?.restart) startAgentEventBridge();

import.meta.hot?.dispose((data) => {
  data.restart = true;
});
