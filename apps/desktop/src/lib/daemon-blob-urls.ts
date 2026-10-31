import { useCallback, useSyncExternalStore } from "react";
import { resolveLocalDaemonConnection } from "./daemon-client";
import { logRendererDiagnostic } from "./diagnostics";

const RELEASE_DELAY_MS = 60_000;
const RETRY_DELAYS_MS = [1_000, 3_000, 10_000];

interface Entry {
  url: string | null;
  listeners: Set<() => void>;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  failedAttempts: number;
  loading: boolean;
}

export interface DaemonBlobUrlSource {
  buildUrl(webSocketUrl: string, key: string): string;
  failureDiagnostic: string;
}

export function createDaemonBlobUrlStore(source: DaemonBlobUrlSource) {
  const entries = new Map<string, Entry>();

  function notify(entry: Entry) {
    for (const listener of entry.listeners) listener();
  }

  function isCurrent(key: string, entry: Entry) {
    return entries.get(key) === entry;
  }

  function scheduleRetry(key: string, entry: Entry) {
    const delay = RETRY_DELAYS_MS[entry.failedAttempts - 1];
    if (delay === undefined) return;
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      if (isCurrent(key, entry) && entry.listeners.size > 0) {
        void fetchBlob(key, entry);
      }
    }, delay);
  }

  async function fetchBlob(key: string, entry: Entry) {
    entry.loading = true;
    try {
      const connection = await resolveLocalDaemonConnection();
      const response = await fetch(
        source.buildUrl(connection.webSocketUrl, key),
        { headers: { Authorization: `Bearer ${connection.token}` } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      entry.loading = false;
      if (!isCurrent(key, entry)) {
        URL.revokeObjectURL(url);
        return;
      }
      entry.url = url;
      notify(entry);
    } catch (error) {
      entry.loading = false;
      entry.failedAttempts += 1;
      logRendererDiagnostic("info", source.failureDiagnostic, {
        key,
        attempt: entry.failedAttempts,
        error: error instanceof Error ? error.message : String(error),
      });
      scheduleRetry(key, entry);
    }
  }

  function needsFetch(entry: Entry) {
    return !entry.url && !entry.loading && !entry.retryTimer;
  }

  function release(key: string, entry: Entry) {
    entry.releaseTimer = null;
    if (entry.listeners.size > 0) return;
    entries.delete(key);
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    if (entry.url) URL.revokeObjectURL(entry.url);
  }

  function subscribe(key: string, listener: () => void) {
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        url: null,
        listeners: new Set(),
        releaseTimer: null,
        retryTimer: null,
        failedAttempts: 0,
        loading: false,
      };
      entries.set(key, entry);
      void fetchBlob(key, entry);
    } else if (needsFetch(entry)) {
      entry.failedAttempts = 0;
      void fetchBlob(key, entry);
    }
    const current = entry;
    if (current.releaseTimer) clearTimeout(current.releaseTimer);
    current.releaseTimer = null;
    current.listeners.add(listener);
    return () => {
      current.listeners.delete(listener);
      if (current.listeners.size === 0 && !current.releaseTimer) {
        current.releaseTimer = setTimeout(
          () => release(key, current),
          RELEASE_DELAY_MS,
        );
      }
    };
  }

  return function useDaemonBlobUrl(key: string | null): string | null {
    const subscribeToKey = useCallback(
      (listener: () => void) =>
        key === null ? () => {} : subscribe(key, listener),
      [key],
    );
    return useSyncExternalStore(subscribeToKey, () =>
      key === null ? null : (entries.get(key)?.url ?? null),
    );
  };
}
