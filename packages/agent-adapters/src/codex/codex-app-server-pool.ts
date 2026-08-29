import {
  CodexAppServerClient,
  type CodexAppServerNotification,
  type CodexAppServerRequest,
} from "./codex-app-server-client";
import { isRecord } from "./codex-app-server-events";

export interface CodexThreadSubscriber {
  onNotification(notification: CodexAppServerNotification): void;
  onServerRequest(request: CodexAppServerRequest): Promise<unknown> | unknown;
  onError(error: Error): void;
}

export interface CodexClientLease {
  client: CodexAppServerClient;
  subscribeThread(threadId: string, subscriber: CodexThreadSubscriber): void;
  unsubscribeThread(threadId: string): void;
  // Global (thread-less) notifications such as account/login/completed.
  onGlobalNotification(
    listener: (notification: CodexAppServerNotification) => void,
  ): () => void;
  release(): void;
}

interface PooledClient {
  client: CodexAppServerClient;
  refCount: number;
  threadSubscribers: Map<string, CodexThreadSubscriber>;
  globalListeners: Set<(notification: CodexAppServerNotification) => void>;
}

// All sessions, model listing, and account calls share the native Codex
// app-server process; events multiplex over one stdio pipe and are routed back
// by params.threadId.
let pooledClient: PooledClient | null = null;

function getThreadId(params: unknown) {
  return isRecord(params) && typeof params.threadId === "string"
    ? params.threadId
    : null;
}

function createPooledClient() {
  const entry: PooledClient = {
    client: null as unknown as CodexAppServerClient,
    refCount: 0,
    threadSubscribers: new Map(),
    globalListeners: new Set(),
  };

  entry.client = new CodexAppServerClient({
    clientName: "agents_app_desktop",
    clientTitle: "Cocurdex Desktop",
    clientVersion: "0.1.0",
    onNotification(notification) {
      const threadId = getThreadId(notification.params);

      if (threadId) {
        entry.threadSubscribers.get(threadId)?.onNotification(notification);
        return;
      }

      for (const listener of entry.globalListeners) {
        listener(notification);
      }
    },
    onServerRequest(request) {
      const threadId = getThreadId(request.params);
      const subscriber = threadId
        ? entry.threadSubscribers.get(threadId)
        : null;

      if (!subscriber) {
        throw new Error(`Unsupported app-server request: ${request.method}`);
      }

      return subscriber.onServerRequest(request);
    },
    onError(error) {
      // Process-level failure (spawn error, crash): the shared client is
      // gone, so drop the pool entry and fan the error out to every session.
      if (pooledClient === entry) {
        pooledClient = null;
      }

      for (const subscriber of entry.threadSubscribers.values()) {
        subscriber.onError(error);
      }
    },
  });

  return entry;
}

export function acquireCodexClient(): CodexClientLease {
  if (!pooledClient) {
    pooledClient = createPooledClient();
  }

  const pooled = pooledClient;
  pooled.refCount += 1;
  const ownedThreadIds = new Set<string>();
  const ownedGlobalListeners = new Set<
    (notification: CodexAppServerNotification) => void
  >();
  let released = false;

  return {
    client: pooled.client,
    subscribeThread(threadId, subscriber) {
      ownedThreadIds.add(threadId);
      pooled.threadSubscribers.set(threadId, subscriber);
    },
    unsubscribeThread(threadId) {
      ownedThreadIds.delete(threadId);
      pooled.threadSubscribers.delete(threadId);
    },
    onGlobalNotification(listener) {
      ownedGlobalListeners.add(listener);
      pooled.globalListeners.add(listener);
      return () => {
        ownedGlobalListeners.delete(listener);
        pooled.globalListeners.delete(listener);
      };
    },
    release() {
      if (released) {
        return;
      }

      released = true;
      for (const threadId of ownedThreadIds) {
        pooled.threadSubscribers.delete(threadId);
      }
      for (const listener of ownedGlobalListeners) {
        pooled.globalListeners.delete(listener);
      }

      pooled.refCount -= 1;
      if (pooled.refCount <= 0 && pooledClient === pooled) {
        pooledClient = null;
        pooled.client.dispose();
      }
    },
  };
}
