import { Effect, Fiber, Schedule } from "effect";

export interface ReclaimCandidate {
  sessionId: string;
  lastActiveAt: number;
  busy: boolean;
  external: boolean;
}

export interface ReclaimPolicy {
  idleMs: number;
  maxExternal: number;
}

export const DEFAULT_RECLAIM_POLICY: ReclaimPolicy = {
  idleMs: 30 * 60_000,
  maxExternal: 8,
};

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

export function selectRuntimesToReclaim(
  candidates: readonly ReclaimCandidate[],
  now: number,
  policy: ReclaimPolicy,
): string[] {
  const external = candidates.filter((candidate) => candidate.external);
  const idle = external
    .filter((candidate) => !candidate.busy)
    .sort((left, right) => left.lastActiveAt - right.lastActiveAt);
  const selected = new Set(
    idle
      .filter((candidate) => now - candidate.lastActiveAt >= policy.idleMs)
      .map((candidate) => candidate.sessionId),
  );
  let live = external.length - selected.size;
  for (const candidate of idle) {
    if (live <= policy.maxExternal) break;
    if (selected.has(candidate.sessionId)) continue;
    selected.add(candidate.sessionId);
    live -= 1;
  }
  return [...selected];
}

export interface RuntimeReclaimerDependencies {
  candidates(): ReclaimCandidate[];
  isBusy(sessionId: string): boolean;
  reclaim(sessionId: string): Promise<unknown>;
  onFailed(sessionId: string, error: unknown): void;
  policy?: ReclaimPolicy;
  intervalMs?: number;
  now?(): number;
}

export class RuntimeReclaimer {
  private fiber: Fiber.Fiber<unknown, unknown> | null = null;
  private sweeping: Promise<void> | null = null;

  constructor(private readonly deps: RuntimeReclaimerDependencies) {}

  start() {
    if (this.fiber) return;
    const interval = this.deps.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.fiber = Effect.runFork(
      Effect.promise(() => this.sweep()).pipe(
        Effect.repeat(Schedule.spaced(interval)),
      ),
    );
  }

  async dispose() {
    const fiber = this.fiber;
    this.fiber = null;
    if (fiber) await Effect.runPromise(Fiber.interrupt(fiber));
    await this.sweeping;
  }

  sweep() {
    this.sweeping ??= this.reclaimSelected().finally(() => {
      this.sweeping = null;
    });
    return this.sweeping;
  }

  private async reclaimSelected() {
    const now = this.deps.now?.() ?? Date.now();
    const policy = this.deps.policy ?? DEFAULT_RECLAIM_POLICY;
    const sessionIds = selectRuntimesToReclaim(
      this.deps.candidates(),
      now,
      policy,
    );
    for (const sessionId of sessionIds) {
      if (this.deps.isBusy(sessionId)) continue;
      try {
        await this.deps.reclaim(sessionId);
      } catch (error) {
        this.deps.onFailed(sessionId, error);
      }
    }
  }
}
