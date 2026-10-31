import type { ContextTransferRecord } from "@cocurdex/shared";
import { useCallback, useSyncExternalStore } from "react";
import { desktopApi } from "@/lib";

const EMPTY: ContextTransferRecord[] = [];
const cache = new Map<string, ContextTransferRecord[]>();
const listeners = new Map<string, Set<() => void>>();
const loading = new Set<string>();
let unsubscribeData: (() => void) | null = null;

function emit(sessionId: string) {
  for (const listener of listeners.get(sessionId) ?? []) listener();
}

async function load(sessionId: string) {
  if (loading.has(sessionId)) return;
  loading.add(sessionId);
  try {
    cache.set(sessionId, await desktopApi.listContextTransfers(sessionId));
    emit(sessionId);
  } catch {
    cache.set(sessionId, cache.get(sessionId) ?? EMPTY);
  } finally {
    loading.delete(sessionId);
  }
}

function watchDataChanges() {
  unsubscribeData ??= desktopApi.onDataChanged((event) => {
    if (!event.areas.includes("agent")) return;
    for (const sessionId of listeners.keys()) void load(sessionId);
  });
}

function subscribe(sessionId: string, listener: () => void) {
  const sessionListeners = listeners.get(sessionId) ?? new Set();
  sessionListeners.add(listener);
  listeners.set(sessionId, sessionListeners);
  watchDataChanges();
  if (!cache.has(sessionId)) void load(sessionId);
  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0) listeners.delete(sessionId);
    if (listeners.size === 0 && unsubscribeData) {
      unsubscribeData();
      unsubscribeData = null;
    }
  };
}

export function useSessionContextTransfers(sessionId: string) {
  const subscribeSession = useCallback(
    (listener: () => void) => subscribe(sessionId, listener),
    [sessionId],
  );
  return useSyncExternalStore(
    subscribeSession,
    () => cache.get(sessionId) ?? EMPTY,
  );
}

export function useMessageContextTransfer(message: {
  id: string;
  sessionId: string;
}) {
  const transfers = useSessionContextTransfers(message.sessionId);
  return (
    transfers.find((transfer) => transfer.consumedByMessageId === message.id) ??
    null
  );
}
