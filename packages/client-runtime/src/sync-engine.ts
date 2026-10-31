import type {
  DaemonEventMeta,
  SyncPullInput,
  SyncPullResult,
} from "@cocurdex/shared";

export interface SyncEngineOptions<Event> {
  pull(input: SyncPullInput): Promise<SyncPullResult>;
  scope(): SyncScope;
  apply(result: SyncPullResult): void;
  applyEvent(event: Event): void;
  maxAttempts?: number;
  retryDelayMs?(failures: number): number;
  onError?(error: unknown): void;
}

export interface SyncScope {
  sessionIds: Iterable<string>;
  hydratedSessionIds: Iterable<string>;
}

export interface SyncEngine<Event> {
  handleEvent(event: Event, meta?: DaemonEventMeta): void;
  synchronize(sessionIds?: string[]): Promise<void>;
  setCursor(cursor: string | null): void;
  getCursor(): string | null;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const UNKNOWN_POSITION: DaemonEventMeta = { epoch: null, seq: null };

function defaultRetryDelay(failures: number) {
  return Math.min(500 * 2 ** (failures - 1), 4000);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSyncEngine<Event>(
  options: SyncEngineOptions<Event>,
): SyncEngine<Event> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelay = options.retryDelayMs ?? defaultRetryDelay;
  const requestedSessionIds = new Set<string>();
  let cursor: string | null = null;
  let running = false;
  let again = false;
  let inFlight: Promise<void> | null = null;
  let boundary: { epoch: string | null; seq: number } | null = null;
  let buffered: { event: Event; meta: DaemonEventMeta }[] = [];

  async function pullOnce() {
    const scope = options.scope();
    const sessionIds = new Set([...requestedSessionIds, ...scope.sessionIds]);
    const result = await options.pull({
      sessionIds: [...sessionIds],
      hydratedSessionIds: [...scope.hydratedSessionIds],
      cursor,
    });
    options.apply(result);
    cursor = result.cursor;
    boundary = { epoch: result.epoch, seq: result.eventSeq };
  }

  function drainBuffered() {
    const pending = buffered;
    buffered = [];
    for (const item of pending) {
      const covered =
        boundary !== null &&
        item.meta.epoch === boundary.epoch &&
        item.meta.seq !== null &&
        item.meta.seq <= boundary.seq;
      if (!covered) options.applyEvent(item.event);
    }
  }

  async function run() {
    let failures = 0;
    try {
      do {
        again = false;
        try {
          await pullOnce();
          failures = 0;
        } catch (error) {
          failures += 1;
          options.onError?.(error);
          if (failures >= maxAttempts) throw error;
          await wait(retryDelay(failures));
          again = true;
          continue;
        }
        drainBuffered();
      } while (again);
    } finally {
      running = false;
      drainBuffered();
    }
  }

  return {
    handleEvent(event, meta) {
      if (running) {
        buffered.push({ event, meta: meta ?? UNKNOWN_POSITION });
        return;
      }
      options.applyEvent(event);
    },
    synchronize(sessionIds = []) {
      for (const id of sessionIds) requestedSessionIds.add(id);
      again = true;
      if (!inFlight) {
        running = true;
        inFlight = run().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
    setCursor(next) {
      cursor = next;
    },
    getCursor() {
      return cursor;
    },
  };
}
