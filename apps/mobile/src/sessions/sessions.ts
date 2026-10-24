import { useCallback, useSyncExternalStore } from "react";
import { hostConnection, onHostConnectionRemoved } from "@/connection";
import { createSessionsStore, type SessionsStore } from "./sessions-store";

const stores = new Map<string, SessionsStore>();

onHostConnectionRemoved((hostId) => {
  stores.delete(hostId);
});

export function sessionsStore(hostId: string) {
  const existing = stores.get(hostId);
  if (existing) return existing;
  const store = createSessionsStore(hostConnection(hostId));
  stores.set(hostId, store);
  return store;
}

export function useHostSessions(hostId: string) {
  const store = sessionsStore(hostId);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useViewedSession(hostId: string, sessionId: string) {
  const store = sessionsStore(hostId);
  const subscribe = useCallback(
    (listener: () => void) => store.viewSession(sessionId, listener),
    [store, sessionId],
  );
  return useSyncExternalStore(subscribe, store.getSnapshot);
}
