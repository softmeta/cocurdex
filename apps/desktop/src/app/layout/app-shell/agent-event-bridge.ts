import { createSyncEngine } from "@cocurdex/client-runtime";
import type { AgentEvent, DaemonEventMeta } from "@cocurdex/shared";
import { getDefaultStore } from "jotai";
import {
  agentRuntimeBySessionAtom,
  applyAgentEventAtom,
  applyAgentRuntimeEventAtom,
  applyPermissionEventAtom,
  applyPlanApprovalEventAtom,
  applyPlanEventAtom,
  applyQuestionEventAtom,
  applyQueuedInputEventAtom,
  applyToolEventAtom,
  messagesLoadedBySessionAtom,
  seedAgentRuntimeAtom,
  toolCallsLoadedBySessionAtom,
} from "@/features/agent";
import {
  applyContextBreakdownEventAtom,
  applyRateLimitsEventAtom,
  applyUsageEventAtom,
} from "@/features/composer";
import {
  activeSessionIdAtom,
  applyRuntimeSessionModesAtom,
  loadSessionAttentionAtom,
  markSessionMessageAtom,
  markSessionsVisitedAtom,
  projectSubagentSessionFromToolCallAtom,
  recordSessionResultAtom,
  sessionsAtom,
  updateSessionStatusAtom,
  updateSessionTitleAtom,
  upsertSessionAtom,
} from "@/features/sessions";
import { applyTurnChangesEventAtom } from "@/features/turn-workspace-changes";
import { desktopApi, taskApi } from "@/lib";
import { applySyncResult } from "./agent-sync-apply";

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
    if (event.message.role === "assistant") {
      recordSessionResult(store, event.sessionId, event.message.createdAt);
    }
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

function recordSessionResult(store: Store, sessionId: string, at: string) {
  store.set(recordSessionResultAtom, { sessionId, at });
  if (store.get(activeSessionIdAtom) === sessionId) {
    store.set(markSessionsVisitedAtom, [sessionId]);
  }
}

function loadSessionAttention(store: Store) {
  void store.set(loadSessionAttentionAtom).catch((error: unknown) => {
    console.error("[AgentEvent] session attention load failed", error);
  });
}

function startSessionVisitSync(store: Store) {
  let visibleSessionId = store.get(activeSessionIdAtom);
  return store.sub(activeSessionIdAtom, () => {
    const nextSessionId = store.get(activeSessionIdAtom);
    if (nextSessionId === visibleSessionId) return;
    const sessions = store.get(sessionsAtom);
    const previousSessionId = sessions.some(
      (session) => session.id === visibleSessionId,
    )
      ? visibleSessionId
      : null;
    const visitedIds = [previousSessionId, nextSessionId].filter(
      (id): id is string => Boolean(id),
    );
    visibleSessionId = nextSessionId;
    store.set(markSessionsVisitedAtom, visitedIds);
  });
}

function startRuntimeStateSeeding(store: Store) {
  const pending = new Set<string>();
  const seed = () => {
    const sessionId = store.get(activeSessionIdAtom);
    if (!sessionId || pending.has(sessionId)) return;
    if (store.get(agentRuntimeBySessionAtom)[sessionId]) return;
    pending.add(sessionId);
    desktopApi
      .getSessionRuntimeState(sessionId)
      .then((state) => store.set(seedAgentRuntimeAtom, { sessionId, state }))
      .catch((error: unknown) =>
        console.error("[AgentEvent] runtime state load failed", error),
      )
      .finally(() => pending.delete(sessionId));
  };
  seed();
  return store.sub(activeSessionIdAtom, seed);
}

export function createAgentEventBridge(store: Store) {
  const engine = createSyncEngine<AgentEvent>({
    pull: (input) => desktopApi.pullSync(input),
    scope: () => {
      const hydrated = new Set([
        ...Object.keys(store.get(messagesLoadedBySessionAtom)),
        ...Object.keys(store.get(toolCallsLoadedBySessionAtom)),
      ]);
      const activeSessionId = store.get(activeSessionIdAtom);
      return {
        sessionIds: activeSessionId ? [...hydrated, activeSessionId] : hydrated,
        hydratedSessionIds: hydrated,
      };
    },
    apply: (result) => {
      applySyncResult(store, result);
      loadSessionAttention(store);
    },
    applyEvent: (event) => applyAgentEventToStore(store, event),
    onError: (error) =>
      console.error("[AgentEvent] sync attempt failed", error),
  });

  const synchronize = (sessionIds: string[] = []) =>
    engine.synchronize(sessionIds);

  const handleAgentEvent = (event: AgentEvent, meta?: DaemonEventMeta) =>
    engine.handleEvent(event, meta);

  const start = () => {
    const unsubscribeEvents = taskApi.onAgentEvent(handleAgentEvent);
    const unsubscribeData = desktopApi.onDataChanged((event) => {
      if (!event.areas.includes("agent")) return;
      void synchronize().catch(console.error);
    });
    const unsubscribeVisits = startSessionVisitSync(store);
    const unsubscribeRuntimeSeeding = startRuntimeStateSeeding(store);
    loadSessionAttention(store);
    return () => {
      unsubscribeEvents();
      unsubscribeData();
      unsubscribeVisits();
      unsubscribeRuntimeSeeding();
    };
  };

  return { start, synchronize, adoptCursor: engine.setCursor };
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

export function adoptAgentSyncCursor(cursor: string) {
  defaultBridge.adoptCursor(cursor);
}

if (import.meta.hot?.data?.restart) startAgentEventBridge();

import.meta.hot?.dispose((data) => {
  data.restart = true;
});
