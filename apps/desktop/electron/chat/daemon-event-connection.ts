import {
  type DaemonEventSubscription,
  subscribeDaemonEvents,
} from "@cocurdex/daemon/client";
import { type CocurdexDaemonEvent, cocurdexDataAreas } from "@cocurdex/shared";

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
  let lastSeq: number | null = null;
  let lastEpoch: string | null = null;

  function reset() {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    lastSeq = subscription?.lastSeq ?? lastSeq;
    lastEpoch = subscription?.epoch ?? lastEpoch;
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
            afterSeq: lastSeq ?? undefined,
            epoch: lastEpoch ?? undefined,
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
        if (connected.replayGap) {
          // The journaled replay could not cover our last position (daemon
          // restart or journal overflow): assume every data area changed so
          // consumers refetch authoritative state.
          options.onEvent({
            type: "data.changed",
            areas: [...cocurdexDataAreas],
          });
        }
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
