import type { DelegationRow } from "@cocurdex/db";
import type { RemoteWorkStatus } from "@cocurdex/shared";
import { Effect, Fiber, Schedule } from "effect";

export interface RemoteWorkWatcherDependencies {
  rows(): DelegationRow[];
  fetch(hostId: string, sessionIds: string[]): Promise<RemoteWorkStatus[]>;
  report(row: DelegationRow, status: RemoteWorkStatus): Promise<void>;
  onChanged(): void;
  onFailed(error: unknown): void;
  intervalMs?: number;
  now?(): number;
}

const DEFAULT_INTERVAL_MS = 15_000;
const HOST_TIMEOUT_MS = 20_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const MAX_ROWS_PER_HOST = 100;

interface HostBackoff {
  failures: number;
  retryAt: number;
}

function sameStatus(
  left: RemoteWorkStatus | undefined,
  right: RemoteWorkStatus,
) {
  return (
    left !== undefined &&
    left.state === right.state &&
    left.waitingFor === right.waitingFor &&
    left.title === right.title &&
    left.latestRun?.id === right.latestRun?.id &&
    left.latestRun?.status === right.latestRun?.status
  );
}

export class RemoteWorkWatcher {
  private readonly statuses = new Map<string, RemoteWorkStatus>();
  private readonly backoff = new Map<string, HostBackoff>();
  private fiber: Fiber.Fiber<unknown, unknown> | null = null;
  private ticking: Promise<void> | null = null;

  constructor(private readonly deps: RemoteWorkWatcherDependencies) {}

  start() {
    if (this.fiber) return;
    const interval = this.deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.fiber = Effect.runFork(
      Effect.promise(() => this.poll()).pipe(
        Effect.repeat(Schedule.spaced(interval)),
      ),
    );
  }

  async dispose() {
    const fiber = this.fiber;
    this.fiber = null;
    if (fiber) await Effect.runPromise(Fiber.interrupt(fiber));
  }

  status(sessionId: string) {
    return this.statuses.get(sessionId) ?? null;
  }

  isUnreachable(hostId: string) {
    return (this.backoff.get(hostId)?.failures ?? 0) > 0;
  }

  remember(status: RemoteWorkStatus) {
    this.statuses.set(status.sessionId, status);
  }

  forgetHost(hostId: string) {
    this.backoff.delete(hostId);
  }

  poll(options: { force?: boolean } = {}) {
    this.ticking ??= this.tick(options.force === true).finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private async tick(force: boolean) {
    const byHost = new Map<string, DelegationRow[]>();
    for (const row of this.deps.rows()) {
      if (!row.remote) continue;
      if (this.statuses.get(row.workSessionId)?.state === "archived") continue;
      byHost.set(row.remote.hostId, [
        ...(byHost.get(row.remote.hostId) ?? []),
        row,
      ]);
    }
    const now = this.now();
    const due = [...byHost]
      .filter(
        ([hostId]) => force || (this.backoff.get(hostId)?.retryAt ?? 0) <= now,
      )
      .map(
        ([hostId, rows]) => [hostId, rows.slice(-MAX_ROWS_PER_HOST)] as const,
      );
    await Effect.runPromise(
      Effect.forEach(
        due,
        ([hostId, rows]) =>
          Effect.promise(() => this.pollHost(hostId, rows)).pipe(
            Effect.timeout(HOST_TIMEOUT_MS),
            Effect.catch(() => Effect.sync(() => this.failed(hostId))),
          ),
        { concurrency: "unbounded", discard: true },
      ),
    );
  }

  private async pollHost(hostId: string, rows: DelegationRow[]) {
    let statuses: RemoteWorkStatus[];
    try {
      statuses = await this.deps.fetch(
        hostId,
        rows.map((row) => row.workSessionId),
      );
    } catch {
      this.failed(hostId);
      return;
    }
    const recovered = this.backoff.delete(hostId);
    let changed = recovered;
    const found = new Map(statuses.map((status) => [status.sessionId, status]));
    for (const row of rows) {
      const status = found.get(row.workSessionId) ?? this.missing(row);
      if (!sameStatus(this.statuses.get(row.workSessionId), status)) {
        changed = true;
      }
      this.statuses.set(row.workSessionId, status);
      if (status.latestRun && status.latestRun.status !== "running") {
        await this.deps
          .report(row, status)
          .catch((error: unknown) => this.deps.onFailed(error));
      }
    }
    if (changed) this.deps.onChanged();
  }

  private missing(row: DelegationRow): RemoteWorkStatus {
    const previous = this.statuses.get(row.workSessionId);
    return {
      sessionId: row.workSessionId,
      title: previous?.title ?? row.remote?.title ?? "",
      state: "archived",
      waitingFor: null,
      updatedAt: previous?.updatedAt ?? row.createdAt,
      latestRun: null,
      reply: null,
    };
  }

  private failed(hostId: string) {
    const failures = (this.backoff.get(hostId)?.failures ?? 0) + 1;
    const interval = this.deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    const delay = Math.min(interval * 2 ** (failures - 1), MAX_BACKOFF_MS);
    this.backoff.set(hostId, { failures, retryAt: this.now() + delay });
    if (failures === 1) this.deps.onChanged();
  }

  private now() {
    return this.deps.now?.() ?? Date.now();
  }
}
