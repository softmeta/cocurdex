import { logDaemonDiagnostic } from "./diagnostics";

export type DaemonReceiptOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface DaemonReceiptExecution {
  outcome: DaemonReceiptOutcome;
  replayed: boolean;
}

export interface DurableReceiptLog {
  read(key: string): Promise<DaemonReceiptOutcome | null>;
  write(key: string, outcome: DaemonReceiptOutcome): Promise<void>;
}

export interface DaemonReceiptStore {
  execute(
    key: string,
    run: () => Promise<DaemonReceiptOutcome>,
    options?: { durable?: boolean },
  ): Promise<DaemonReceiptExecution>;
}

async function readDurable(log: DurableReceiptLog, key: string) {
  try {
    return await log.read(key);
  } catch (error) {
    logDaemonDiagnostic("warn", "[Receipts] durable read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function writeDurable(
  log: DurableReceiptLog,
  key: string,
  outcome: DaemonReceiptOutcome,
) {
  try {
    await log.write(key, outcome);
  } catch (error) {
    logDaemonDiagnostic("warn", "[Receipts] durable write failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function createDaemonReceiptStore(
  options: {
    maxEntries?: number;
    ttlMs?: number;
    durableLog?: () => DurableReceiptLog | null;
  } = {},
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

  // Capacity pressure must never drop an active execution; only settled
  // receipts are evictable, oldest first.
  const enforceCapacity = () => {
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
  };

  return {
    execute(key, run, { durable = false } = {}) {
      const existing = receipts.get(key);
      if (existing) {
        return existing.then((outcome) => ({ outcome, replayed: true }));
      }
      const log = durable ? (options.durableLog?.() ?? null) : null;
      let replayedFromLog = false;
      const outcome = Promise.resolve().then(async () => {
        const stored = log ? await readDurable(log, key) : null;
        if (stored) {
          replayedFromLog = true;
          return stored;
        }
        const result = await run();
        if (log && result.ok) await writeDurable(log, key, result);
        return result;
      });
      receipts.set(key, outcome);
      // Retention starts only once the operation settles: an in-flight
      // mutation must keep its receipt so retries coalesce instead of
      // duplicating side effects. Capacity is enforced again on settle so a
      // burst larger than maxEntries drains once its members finish.
      const markSettled = () => {
        settled.add(key);
        const timer = setTimeout(() => evict(key), ttlMs);
        timer.unref?.();
        timers.set(key, timer);
        enforceCapacity();
      };
      void outcome.then(markSettled, markSettled);
      enforceCapacity();
      return outcome.then((value) => ({
        outcome: value,
        replayed: replayedFromLog,
      }));
    },
  };
}
