export type DaemonReceiptOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface DaemonReceiptExecution {
  outcome: DaemonReceiptOutcome;
  replayed: boolean;
}

export interface DaemonReceiptStore {
  execute(
    key: string,
    run: () => Promise<DaemonReceiptOutcome>,
  ): Promise<DaemonReceiptExecution>;
}

// In-memory receipts coalesce in-flight duplicates and replay completed
// outcomes for a short window. A daemon restart drops them; clients must use
// a new idempotency key when the intent is genuinely a new operation.
export function createDaemonReceiptStore(
  options: { maxEntries?: number; ttlMs?: number } = {},
): DaemonReceiptStore {
  const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  const maxEntries = options.maxEntries ?? 500;
  const receipts = new Map<string, Promise<DaemonReceiptOutcome>>();
  const settled = new Set<string>();
  const timers = new Map<string, NodeJS.Timeout>();

  const evict = (key: string) => {
    receipts.delete(key);
    settled.delete(key);
    const timer = timers.get(key);
    if (timer) {
      clearTimeout(timer);
      timers.delete(key);
    }
  };

  return {
    execute(key, run) {
      const existing = receipts.get(key);
      if (existing) {
        return existing.then((outcome) => ({ outcome, replayed: true }));
      }
      const outcome = Promise.resolve().then(run);
      receipts.set(key, outcome);
      // Retention starts only once the operation settles: an in-flight
      // mutation must keep its receipt so retries coalesce instead of
      // duplicating side effects.
      void outcome.then(
        () => {
          settled.add(key);
          const timer = setTimeout(() => evict(key), ttlMs);
          timer.unref?.();
          timers.set(key, timer);
        },
        () => {
          settled.add(key);
          const timer = setTimeout(() => evict(key), ttlMs);
          timer.unref?.();
          timers.set(key, timer);
        },
      );
      // Capacity pressure must never drop an active execution; only settled
      // receipts are evictable, oldest first.
      while (receipts.size > maxEntries) {
        let oldest: string | undefined;
        for (const candidate of receipts.keys()) {
          if (settled.has(candidate)) {
            oldest = candidate;
            break;
          }
        }
        if (oldest === undefined) break;
        evict(oldest);
      }
      return outcome.then((value) => ({ outcome: value, replayed: false }));
    },
  };
}
