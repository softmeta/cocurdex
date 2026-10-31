import type { SessionObservationSnapshot } from "@cocurdex/shared";
import { useCallback, useSyncExternalStore } from "react";
import { hostConnection } from "@/connection";
import {
  createSessionDetailStore,
  type SessionDetailStore,
} from "./session-detail-store";

const RECENT_LIMIT = 8;
const stores = new Map<string, SessionDetailStore>();
const recent = new Map<string, SessionObservationSnapshot>();

function remember(key: string, observation: SessionObservationSnapshot | null) {
  recent.delete(key);
  if (!observation) return;
  recent.set(key, observation);
  const oldest = recent.keys().next().value;
  if (recent.size > RECENT_LIMIT && oldest !== undefined) recent.delete(oldest);
}

function sessionDetailStore(hostId: string, sessionId: string) {
  const key = JSON.stringify([hostId, sessionId]);
  const existing = stores.get(key);
  if (existing) return { key, store: existing };
  const store = createSessionDetailStore(
    hostConnection(hostId),
    sessionId,
    recent.get(key) ?? null,
  );
  stores.set(key, store);
  return { key, store };
}

function subscribeSessionDetail(
  hostId: string,
  sessionId: string,
  listener: () => void,
) {
  const { key, store } = sessionDetailStore(hostId, sessionId);
  const unsubscribe = store.subscribe(listener);
  return () => {
    unsubscribe();
    if (!store.observed() && stores.get(key) === store) {
      stores.delete(key);
      remember(key, store.getSnapshot().observation);
    }
  };
}

export function useSessionDetail(hostId: string, sessionId: string) {
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeSessionDetail(hostId, sessionId, listener),
    [hostId, sessionId],
  );
  return useSyncExternalStore(subscribe, () =>
    sessionDetailStore(hostId, sessionId).store.getSnapshot(),
  );
}
