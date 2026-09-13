import {
  type DaemonEventSubscription,
  subscribeDaemonEvents,
} from "@cocurdex/daemon/client";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";

interface ConnectionOptions {
  ensure(): Promise<void>;
  userDataPath: string;
  onEvent(event: CocurdexDaemonEvent): void;
  onConnected?(): void;
  onDisconnect(error: Error): void;
}

export function createDaemonEventConnection(options: ConnectionOptions) {
  let generation = 0;
  let disposed = false;
  let subscription: DaemonEventSubscription | null = null;
  let pending: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let timer: NodeJS.Timeout | null = null;

  function reset() {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    subscription?.close();
    subscription = null;
    pending = null;
  }

  function reconnect(attemptGeneration: number, error: Error) {
    if (disposed || attemptGeneration !== generation) return;
    reset();
    options.onDisconnect(error);
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, 500);
    timer.unref?.();
  }

  function connect(): Promise<void> {
    if (disposed || subscription) return Promise.resolve();
    if (pending) return pending;
    if (timer) clearTimeout(timer);
    timer = null;
    const attemptGeneration = ++generation;
    const attemptController = new AbortController();
    controller = attemptController;
    const attempt = (async () => {
      try {
        await Promise.resolve().then(options.ensure);
        if (disposed || attemptGeneration !== generation) return;
        const connected = await subscribeDaemonEvents(
          (event) => {
            if (!disposed && attemptGeneration === generation)
              options.onEvent(event);
          },
          {
            userDataPath: options.userDataPath,
            signal: attemptController.signal,
            onDisconnect: (error) =>
              reconnect(
                attemptGeneration,
                error ?? new Error("Daemon disconnected"),
              ),
          },
        );
        if (disposed || attemptGeneration !== generation) {
          connected.close();
          return;
        }
        subscription = connected;
        options.onConnected?.();
      } catch (error) {
        reconnect(
          attemptGeneration,
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        if (attemptGeneration === generation) pending = null;
      }
    })();
    pending = attempt;
    return attempt;
  }

  return {
    connect,
    reset,
    dispose() {
      disposed = true;
      reset();
    },
  };
}
