import type { HostConnection } from "@cocurdex/client-runtime";
import type {
  AgentMessageDeltaEvent,
  AgentToolCallRecord,
  CocurdexDaemonEvent,
  MessageRecord,
  SessionObservationSnapshot,
} from "@cocurdex/shared";
import { STREAM_RENDER_BATCH_MS } from "@cocurdex/shared";

export type SessionDetailConnection = Pick<
  HostConnection,
  "request" | "onEvent" | "getState" | "subscribeState"
>;

export interface SessionDetailSnapshot {
  loaded: boolean;
  failed: boolean;
  missing: boolean;
  observation: SessionObservationSnapshot | null;
}

const RELOAD_EVENTS = new Set<CocurdexDaemonEvent["type"]>([
  "state.changed",
  "run.updated",
  "turn.completed",
  "permission.requested",
  "permission.resolved",
  "question.requested",
  "question.resolved",
  "plan.approval.requested",
  "plan.approval.resolved",
  "plan.updated",
  "error",
]);

export const DETAIL_RELOAD_DELAY_MS = 250;
export const DETAIL_STREAM_BATCH_MS = STREAM_RENDER_BATCH_MS;

function upsertById<T extends { id: string }>(items: readonly T[], next: T) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [...items, next];
  return items.map((item, at) => (at === index ? next : item));
}

function appendDelta(
  active: readonly MessageRecord[],
  event: AgentMessageDeltaEvent,
): MessageRecord[] {
  const current = active.find((message) => message.id === event.messageId);
  if (current) {
    return active.map((message) =>
      message.id === event.messageId
        ? { ...message, content: message.content + event.delta }
        : message,
    );
  }
  return [
    ...active,
    {
      id: event.messageId,
      sessionId: event.sessionId,
      role: event.role,
      kind: event.kind,
      content: event.delta,
      attachments: [],
      createdAt: event.createdAt,
      seq: event.seq,
    },
  ];
}

function eventSessionId(event: CocurdexDaemonEvent) {
  return "sessionId" in event && typeof event.sessionId === "string"
    ? event.sessionId
    : null;
}

export function createSessionDetailStore(
  connection: SessionDetailConnection,
  sessionId: string,
  lastSeen: SessionObservationSnapshot | null = null,
) {
  const listeners = new Set<() => void>();
  let snapshot: SessionDetailSnapshot = {
    loaded: lastSeen !== null,
    failed: false,
    missing: false,
    observation: lastSeen,
  };
  let stop: (() => void) | null = null;
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  let streamTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let live = connection.getState().status === "live";

  const notify = () => {
    if (streamTimer) clearTimeout(streamTimer);
    streamTimer = null;
    for (const listener of [...listeners]) listener();
  };

  const publish = (next: Partial<SessionDetailSnapshot>, batch = false) => {
    snapshot = { ...snapshot, ...next };
    if (batch) {
      streamTimer ??= setTimeout(notify, DETAIL_STREAM_BATCH_MS);
    } else {
      notify();
    }
  };

  const updateObservation = (
    change: (
      observation: SessionObservationSnapshot,
    ) => SessionObservationSnapshot,
    batch = false,
  ) => {
    if (snapshot.observation) {
      publish({ observation: change(snapshot.observation) }, batch);
    }
  };

  async function load() {
    const current = ++generation;
    try {
      const observation = await connection.request("session.snapshot", {
        sessionId,
      });
      if (current !== generation) return;
      publish({
        loaded: true,
        failed: false,
        missing: observation === null,
        observation,
      });
    } catch {
      if (current === generation) publish({ failed: !snapshot.loaded });
    }
  }

  function scheduleReload() {
    if (reloadTimer) return;
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      void load();
    }, DETAIL_RELOAD_DELAY_MS);
  }

  function applyToolCall(toolCall: AgentToolCallRecord) {
    updateObservation((observation) => ({
      ...observation,
      toolCalls: upsertById(observation.toolCalls, toolCall),
    }));
  }

  function handleEvent(event: CocurdexDaemonEvent) {
    if (event.type === "data.changed") {
      if (event.areas.includes("agent")) void load();
      return;
    }
    if (eventSessionId(event) !== sessionId) return;
    switch (event.type) {
      case "message.delta":
        updateObservation(
          (observation) => ({
            ...observation,
            activeMessages: appendDelta(observation.activeMessages, event),
          }),
          true,
        );
        break;
      case "message.completed":
        updateObservation((observation) => ({
          ...observation,
          messages: upsertById(observation.messages, event.message),
          activeMessages: observation.activeMessages.filter(
            (message) => message.id !== event.message.id,
          ),
        }));
        break;
      case "tool.started":
      case "tool.updated":
      case "tool.finished":
        applyToolCall(event.toolCall);
        break;
      case "session.upserted":
        updateObservation((observation) => ({
          ...observation,
          session: event.session,
        }));
        break;
      case "session.title.updated":
        updateObservation((observation) => ({
          ...observation,
          session: { ...observation.session, title: event.title },
        }));
        break;
      default:
        if (RELOAD_EVENTS.has(event.type)) scheduleReload();
    }
  }

  function start() {
    const stopEvents = connection.onEvent(handleEvent);
    const stopState = connection.subscribeState((state) => {
      const reconnected = state.status === "live" && !live;
      live = state.status === "live";
      if (reconnected) void load();
    });
    void load();
    return () => {
      stopEvents();
      stopState();
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = null;
      if (streamTimer) clearTimeout(streamTimer);
      streamTimer = null;
    };
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      stop ??= start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop) {
          stop();
          stop = null;
        }
      };
    },
    getSnapshot: () => snapshot,
    observed: () => listeners.size > 0,
    reload: load,
  };
}

export type SessionDetailStore = ReturnType<typeof createSessionDetailStore>;
