import type { ConnectionState, HostConnection } from "@cocurdex/client-runtime";
import type {
  CocurdexDaemonEvent,
  SessionAttentionSnapshot,
  SessionRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";

export type SessionsConnection = Pick<
  HostConnection,
  "request" | "onEvent" | "getState" | "subscribeState"
>;

export interface HostSessionsSnapshot {
  loaded: boolean;
  failed: boolean;
  connection: ConnectionState["status"];
  workspaces: readonly WorkspaceRecord[];
  sessions: readonly SessionRecord[];
  attention: readonly SessionAttentionSnapshot[];
}

const ATTENTION_EVENTS = new Set<CocurdexDaemonEvent["type"]>([
  "session.upserted",
  "state.changed",
  "run.updated",
  "turn.completed",
  "permission.requested",
  "permission.resolved",
  "question.requested",
  "question.resolved",
  "plan.approval.requested",
  "plan.approval.resolved",
]);

export const ATTENTION_REFRESH_DELAY_MS = 250;

function upsert(sessions: readonly SessionRecord[], next: SessionRecord) {
  const index = sessions.findIndex((session) => session.id === next.id);
  if (index < 0) return [...sessions, next];
  return sessions.map((session, at) => (at === index ? next : session));
}

function retitle(
  sessions: readonly SessionRecord[],
  sessionId: string,
  title: string,
) {
  return sessions.map((session) =>
    session.id === sessionId ? { ...session, title } : session,
  );
}

function sessionFamilies(
  sessions: readonly SessionRecord[],
  rootIds: readonly string[],
) {
  const children = new Map<string, string[]>();
  for (const session of sessions) {
    if (!session.parentSessionId) continue;
    const siblings = children.get(session.parentSessionId) ?? [];
    siblings.push(session.id);
    children.set(session.parentSessionId, siblings);
  }
  const family = new Set<string>();
  const pending = [...rootIds];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (family.has(id)) continue;
    family.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return family;
}

export function createSessionsStore(connection: SessionsConnection) {
  const listeners = new Set<() => void>();
  let snapshot: HostSessionsSnapshot = {
    loaded: false,
    failed: false,
    connection: connection.getState().status,
    workspaces: [],
    sessions: [],
    attention: [],
  };
  let stop: (() => void) | null = null;
  let attentionTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  const viewed = new Map<string, number>();
  const visiting = new Set<string>();

  const publish = (next: Partial<HostSessionsSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of [...listeners]) listener();
    if (next.attention || next.sessions) markViewedVisited();
  };

  async function load() {
    const current = ++generation;
    try {
      const [workspaces, sessions, attention] = await Promise.all([
        connection.request("workspace.list"),
        connection.request("session.list"),
        connection.request("attention.list"),
      ]);
      if (current !== generation) return;
      publish({ loaded: true, failed: false, workspaces, sessions, attention });
    } catch {
      if (current === generation) publish({ failed: !snapshot.loaded });
    }
  }

  async function refreshAttention() {
    attentionTimer = null;
    try {
      publish({ attention: await connection.request("attention.list") });
    } catch {}
  }

  async function refreshWorkspaces() {
    try {
      publish({ workspaces: await connection.request("workspace.list") });
    } catch {}
  }

  async function markVisited(sessionId: string) {
    visiting.add(sessionId);
    try {
      const next = await connection.request("attention.update", {
        sessionId,
        action: "visited",
        at: new Date().toISOString(),
      });
      publish({
        attention: snapshot.attention.map((entry) =>
          entry.sessionId === sessionId ? next : entry,
        ),
      });
    } catch {
    } finally {
      visiting.delete(sessionId);
    }
  }

  function markViewedVisited() {
    if (viewed.size === 0) return;
    const family = sessionFamilies(snapshot.sessions, [...viewed.keys()]);
    for (const entry of snapshot.attention) {
      if (
        entry.attentionState === "completed-unread" &&
        family.has(entry.sessionId) &&
        !visiting.has(entry.sessionId)
      ) {
        void markVisited(entry.sessionId);
      }
    }
  }

  function scheduleAttention() {
    if (attentionTimer) return;
    attentionTimer = setTimeout(refreshAttention, ATTENTION_REFRESH_DELAY_MS);
  }

  function handleEvent(event: CocurdexDaemonEvent) {
    if (event.type === "session.upserted") {
      publish({ sessions: upsert(snapshot.sessions, event.session) });
    } else if (event.type === "session.title.updated") {
      publish({
        sessions: retitle(snapshot.sessions, event.sessionId, event.title),
      });
    } else if (event.type === "data.changed") {
      if (event.areas.includes("agent")) void load();
      else if (event.areas.includes("workspace")) void refreshWorkspaces();
    }
    if (ATTENTION_EVENTS.has(event.type)) scheduleAttention();
  }

  function start() {
    const stopEvents = connection.onEvent(handleEvent);
    const stopState = connection.subscribeState((state) => {
      const reconnected =
        state.status === "live" && snapshot.connection !== "live";
      publish({ connection: state.status });
      if (reconnected) void load();
    });
    void load();
    return () => {
      stopEvents();
      stopState();
      if (attentionTimer) clearTimeout(attentionTimer);
      attentionTimer = null;
    };
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    stop ??= start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && stop) {
        stop();
        stop = null;
      }
    };
  }

  function viewSession(sessionId: string, listener: () => void) {
    viewed.set(sessionId, (viewed.get(sessionId) ?? 0) + 1);
    const unsubscribe = subscribe(listener);
    markViewedVisited();
    return () => {
      const count = (viewed.get(sessionId) ?? 1) - 1;
      if (count > 0) viewed.set(sessionId, count);
      else viewed.delete(sessionId);
      unsubscribe();
    };
  }

  return {
    subscribe,
    viewSession,
    getSnapshot: () => snapshot,
    reload: load,
  };
}

export type SessionsStore = ReturnType<typeof createSessionsStore>;
