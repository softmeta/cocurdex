import { useSyncExternalStore } from "react";
import { hostConnection, onHostConnectionRemoved } from "@/connection";
import {
  createRuntimeStateStore,
  type RuntimeStateStore,
} from "./runtime-state-store";

const stores = new Map<string, Map<string, RuntimeStateStore>>();

onHostConnectionRemoved((hostId) => {
  stores.delete(hostId);
});

function runtimeStateStore(hostId: string, sessionId: string) {
  const host = stores.get(hostId) ?? new Map<string, RuntimeStateStore>();
  stores.set(hostId, host);
  const existing = host.get(sessionId);
  if (existing) return existing;
  const store = createRuntimeStateStore(hostConnection(hostId), sessionId);
  host.set(sessionId, store);
  return store;
}

export function useSessionRuntimeState(hostId: string, sessionId: string) {
  const store = runtimeStateStore(hostId, sessionId);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
