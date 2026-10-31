import type { HostConnection } from "@cocurdex/client-runtime";
import {
  type AgentSessionRuntimeState,
  applySessionRuntimeEvent,
  EMPTY_AGENT_SESSION_RUNTIME_STATE,
  isSessionRuntimeEvent,
} from "@cocurdex/shared";

export type RuntimeStateConnection = Pick<
  HostConnection,
  "request" | "onEvent" | "getState" | "subscribeState"
>;

export interface RuntimeStateStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AgentSessionRuntimeState;
}

export function createRuntimeStateStore(
  connection: RuntimeStateConnection,
  sessionId: string,
): RuntimeStateStore {
  let state = EMPTY_AGENT_SESSION_RUNTIME_STATE;
  let stop: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: AgentSessionRuntimeState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const load = async () => {
    try {
      publish(await connection.request("session.runtimeState", { sessionId }));
    } catch {
      return;
    }
  };

  const start = () => {
    const stopEvents = connection.onEvent((event) => {
      if (isSessionRuntimeEvent(event) && event.sessionId === sessionId) {
        publish(applySessionRuntimeEvent(state, event));
      }
    });
    let live = connection.getState().status === "live";
    void load();
    const stopState = connection.subscribeState((connectionState) => {
      const nowLive = connectionState.status === "live";
      if (nowLive && !live) void load();
      live = nowLive;
    });
    return () => {
      stopEvents();
      stopState();
    };
  };

  return {
    subscribe(listener) {
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
    getSnapshot: () => state,
  };
}
