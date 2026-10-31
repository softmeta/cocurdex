import type {
  DaemonEventSubscription,
  DaemonRpcSubscribeOptions,
} from "@cocurdex/rpc/client";
import {
  type CocurdexDaemonEvent,
  cocurdexDataAreas,
  type DaemonEventMeta,
} from "@cocurdex/shared";
import { type BackoffPolicy, backoffDelay, DEFAULT_BACKOFF } from "./backoff";
import type { ForegroundWakeup } from "./foreground-wakeup";
import type { PlatformSignals } from "./platform";

export type DaemonEventSubscriber = (
  onEvent: (event: CocurdexDaemonEvent, meta: DaemonEventMeta) => void,
  options: DaemonRpcSubscribeOptions,
) => Promise<DaemonEventSubscription>;

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "live"
  | "retrying"
  | "waiting"
  | "disposed";

export type WaitReason = "offline" | "unauthorized";

export interface ConnectionState {
  status: ConnectionStatus;
  failures: number;
  retryAt: number | null;
  waitReason: WaitReason | null;
  lastError: string | null;
  epoch: string | null;
  lastSeq: number | null;
}

export interface ConnectionSupervisorOptions {
  subscribe: DaemonEventSubscriber;
  ensure?(): Promise<void>;
  probe?(): Promise<void>;
  onEvent(event: CocurdexDaemonEvent, meta?: DaemonEventMeta): void;
  onConnected?(): void;
  onDisconnect?(error: Error): void;
  signals?: PlatformSignals;
  backoff?: Partial<BackoffPolicy>;
  stableAfterMs?: number;
  now?(): number;
}

export type ConnectionSupervisor = ReturnType<
  typeof createConnectionSupervisor
>;

const DEFAULT_STABLE_AFTER_MS = 10_000;

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  (timer as { unref?: () => void }).unref?.();
}

function errorOf(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function isUnauthorized(error: Error) {
  return (error as { code?: unknown }).code === "UNAUTHORIZED";
}

export function createConnectionSupervisor(
  options: ConnectionSupervisorOptions,
) {
  const policy: BackoffPolicy = { ...DEFAULT_BACKOFF, ...options.backoff };
  const stableAfterMs = options.stableAfterMs ?? DEFAULT_STABLE_AFTER_MS;
  const now = options.now ?? Date.now;
  const listeners = new Set<(state: ConnectionState) => void>();
  let state: ConnectionState = {
    status: "idle",
    failures: 0,
    retryAt: null,
    waitReason: null,
    lastError: null,
    epoch: null,
    lastSeq: null,
  };
  let generation = 0;
  let subscription: DaemonEventSubscription | null = null;
  let pending: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

  function update(patch: Partial<ConnectionState>) {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener(state);
  }

  function clearTimers() {
    if (retryTimer) clearTimeout(retryTimer);
    if (stableTimer) clearTimeout(stableTimer);
    retryTimer = null;
    stableTimer = null;
  }

  function release() {
    generation += 1;
    clearTimers();
    controller?.abort();
    controller = null;
    if (subscription) {
      state = {
        ...state,
        epoch: subscription.epoch ?? state.epoch,
        lastSeq: subscription.lastSeq ?? state.lastSeq,
      };
    }
    subscription?.close();
    subscription = null;
    pending = null;
  }

  function isOffline() {
    return options.signals?.network?.isOnline() === false;
  }

  function fail(attemptGeneration: number, error: Error) {
    if (state.status === "disposed" || attemptGeneration !== generation) return;
    release();
    options.onDisconnect?.(error);
    const failures = state.failures + 1;
    const waitReason: WaitReason | null = isUnauthorized(error)
      ? "unauthorized"
      : isOffline()
        ? "offline"
        : null;
    if (waitReason) {
      update({
        status: "waiting",
        failures,
        retryAt: null,
        waitReason,
        lastError: error.message,
      });
      return;
    }
    const delay = backoffDelay(failures, policy);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
    unrefTimer(retryTimer);
    update({
      status: "retrying",
      failures,
      retryAt: now() + delay,
      waitReason: null,
      lastError: error.message,
    });
  }

  function markLive(connected: DaemonEventSubscription) {
    subscription = connected;
    update({
      status: "live",
      retryAt: null,
      waitReason: null,
      lastError: null,
      epoch: connected.epoch,
    });
    stableTimer = setTimeout(() => {
      stableTimer = null;
      update({ failures: 0 });
    }, stableAfterMs);
    unrefTimer(stableTimer);
    if (connected.replayGap) {
      options.onEvent({ type: "data.changed", areas: [...cocurdexDataAreas] });
    }
    options.onConnected?.();
  }

  function connect(): Promise<void> {
    if (state.status === "disposed" || subscription) return Promise.resolve();
    if (pending) return pending;
    startSignals();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    const attemptGeneration = ++generation;
    const attemptController = new AbortController();
    controller = attemptController;
    update({ status: "connecting", retryAt: null, waitReason: null });
    const attempt = (async () => {
      try {
        await options.ensure?.();
        if (attemptGeneration !== generation) return;
        const connected = await options.subscribe(
          (event, meta) => {
            if (attemptGeneration !== generation) return;
            if (meta.seq !== null) state = { ...state, lastSeq: meta.seq };
            options.onEvent(event, meta);
          },
          {
            afterSeq: state.lastSeq ?? undefined,
            epoch: state.epoch ?? undefined,
            signal: attemptController.signal,
            onDisconnect: (error) =>
              fail(
                attemptGeneration,
                error ?? new Error("Daemon disconnected"),
              ),
          },
        );
        if (attemptGeneration !== generation) {
          connected.close();
          return;
        }
        markLive(connected);
      } catch (error) {
        fail(attemptGeneration, errorOf(error));
      } finally {
        if (attemptGeneration === generation) pending = null;
      }
    })();
    pending = attempt;
    return attempt;
  }

  function wake(wakeup: ForegroundWakeup = "probe") {
    if (wakeup === "reconnect" && state.status === "live") {
      release();
      void connect();
      return;
    }
    if (state.status === "retrying" || state.status === "waiting") {
      void connect();
      return;
    }
    if (state.status !== "live" || !options.probe) return;
    const probeGeneration = generation;
    options.probe().catch((error: unknown) => {
      fail(probeGeneration, errorOf(error));
      void connect();
    });
  }

  const unsubscribers: (() => void)[] = [];

  function startSignals() {
    if (started) return;
    started = true;
    const { network, lifecycle } = options.signals ?? {};
    if (network) {
      unsubscribers.push(
        network.subscribe((online) => {
          if (online) wake();
        }),
      );
    }
    if (lifecycle) {
      unsubscribers.push(
        lifecycle.subscribeForeground((wakeup) => wake(wakeup)),
      );
    }
  }

  function reset() {
    release();
    if (state.status !== "disposed") {
      update({ status: "idle", retryAt: null, waitReason: null });
    }
  }

  return {
    connect,
    reset,
    wake,
    getState: () => state,
    subscribeState(listener: (state: ConnectionState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      release();
      for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
      update({ status: "disposed", retryAt: null });
      listeners.clear();
    },
  };
}
