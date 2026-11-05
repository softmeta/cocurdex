import crypto from "node:crypto";
import type { RoutineRepository } from "@cocurdex/db";
import {
  type CreateRoutinePayload,
  type MessageRecord,
  ROUTINE_ACCESS_VALUES,
  ROUTINE_DELIVER_VALUES,
  type RoutineRecord,
  type RoutineRunRecord,
  type RoutineRunTrigger,
  routineScheduleError,
  type UpdateRoutinePayload,
} from "@cocurdex/shared";
import type { SessionTurnOutcome } from "../session-control/execution-types";
import {
  isValidTimeZone,
  ROUTINE_MAX_FAILURES,
  ROUTINE_RUN_WINDOW_MS,
  routineBackoffMs,
  routineDecision,
  routineNextRunAt,
} from "./routine-schedule";

const TICK_MS = 30_000;
const SUMMARY_LENGTH = 600;

export interface RoutineServiceDeps {
  repository: RoutineRepository;
  personaExists(agentId: string): Promise<boolean>;
  ensureSession(routine: RoutineRecord): Promise<string>;
  runTurn(
    routine: RoutineRecord,
    sessionId: string,
  ): Promise<SessionTurnOutcome>;
  announceChanged(): void;
  defaultTimeZone?: () => string;
  now?: () => Date;
  tickMs?: number;
}

function summarize(message: MessageRecord) {
  const text = message.content.trim();
  return text.length > SUMMARY_LENGTH
    ? `${text.slice(0, SUMMARY_LENGTH - 1)}…`
    : text;
}

function requireText(value: string, label: string) {
  const text = value.trim();
  if (!text) throw new Error(`The routine ${label} cannot be empty.`);
  return text;
}

function checkOneOf<T extends string>(
  values: readonly T[],
  value: T | undefined,
  label: string,
) {
  if (value !== undefined && !values.includes(value)) {
    throw new Error(`Unknown routine ${label}: ${value}`);
  }
}

export interface RoutineActiveRun {
  run: RoutineRunRecord;
  done: Promise<RoutineRunRecord>;
}

export class RoutineService {
  private readonly now: () => Date;
  private readonly running = new Map<string, RoutineActiveRun>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking: Promise<void> | null = null;

  constructor(private readonly deps: RoutineServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  start() {
    const at = this.now().toISOString();
    for (const run of this.deps.repository.listRunning()) {
      this.deps.repository.saveRun({
        ...run,
        status: "failed",
        error: "The daemon stopped during the run.",
        finishedAt: at,
      });
    }
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.tick(),
      this.deps.tickMs ?? TICK_MS,
    );
    this.timer.unref?.();
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  list(agentId?: string | null) {
    return agentId
      ? this.deps.repository.listByAgent(agentId)
      : this.deps.repository.list();
  }

  get(id: string) {
    return this.deps.repository.getById(id);
  }

  runs(routineId: string | null, limit = 20) {
    return this.deps.repository.listRuns(
      routineId,
      Math.min(200, Math.max(1, limit)),
    );
  }

  latestRuns() {
    return new Map(
      this.deps.repository
        .latestFinishedRuns()
        .map((run) => [run.routineId, run] as const),
    );
  }

  findBySession(sessionId: string) {
    return this.deps.repository.findBySession(sessionId);
  }

  async create(payload: CreateRoutinePayload) {
    if (!(await this.deps.personaExists(payload.agentId))) {
      throw new Error(`Personal agent ${payload.agentId} was not found`);
    }
    const timeZone = this.checkTimeZone(payload.timeZone);
    this.checkSchedule(payload.schedule);
    checkOneOf(ROUTINE_ACCESS_VALUES, payload.access, "access");
    checkOneOf(ROUTINE_DELIVER_VALUES, payload.deliver, "delivery");
    const now = this.now();
    const routine: RoutineRecord = {
      id: crypto.randomUUID(),
      agentId: payload.agentId,
      name: requireText(payload.name, "name"),
      prompt: requireText(payload.prompt, "prompt"),
      schedule: payload.schedule,
      timeZone,
      access: payload.access ?? "read-and-draft",
      deliver: payload.deliver ?? "inbox",
      pausedReason: null,
      sessionId: null,
      nextRunAt: routineNextRunAt(
        payload.schedule,
        timeZone,
        now,
      ).toISOString(),
      lastRunAt: null,
      failureCount: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.deps.repository.upsert(routine);
    this.deps.announceChanged();
    return routine;
  }

  update(payload: UpdateRoutinePayload) {
    const current = this.require(payload.id);
    if (payload.schedule) this.checkSchedule(payload.schedule);
    checkOneOf(ROUTINE_ACCESS_VALUES, payload.access, "access");
    checkOneOf(ROUTINE_DELIVER_VALUES, payload.deliver, "delivery");
    const now = this.now();
    const schedule = payload.schedule ?? current.schedule;
    const timeZone =
      payload.timeZone === undefined
        ? current.timeZone
        : this.checkTimeZone(payload.timeZone);
    const resumed = payload.paused === false && current.pausedReason !== null;
    const rescheduled =
      resumed ||
      payload.schedule !== undefined ||
      payload.timeZone !== undefined;
    let pausedReason = current.pausedReason;
    if (payload.paused === true) pausedReason = "user";
    if (payload.paused === false) pausedReason = null;
    const next: RoutineRecord = {
      ...current,
      name:
        payload.name === undefined
          ? current.name
          : requireText(payload.name, "name"),
      prompt:
        payload.prompt === undefined
          ? current.prompt
          : requireText(payload.prompt, "prompt"),
      schedule,
      timeZone,
      access: payload.access ?? current.access,
      deliver: payload.deliver ?? current.deliver,
      pausedReason,
      failureCount: resumed ? 0 : current.failureCount,
      nextRunAt: rescheduled
        ? routineNextRunAt(schedule, timeZone, now).toISOString()
        : current.nextRunAt,
      updatedAt: now.toISOString(),
    };
    this.deps.repository.upsert(next);
    this.deps.announceChanged();
    return next;
  }

  delete(id: string) {
    this.require(id);
    this.deps.repository.delete(id);
    this.deps.announceChanged();
  }

  deleteForAgent(agentId: string) {
    const routines = this.deps.repository.listByAgent(agentId);
    for (const routine of routines) this.deps.repository.delete(routine.id);
    if (routines.length > 0) this.deps.announceChanged();
    return routines;
  }

  runNow(id: string) {
    const routine = this.require(id);
    const active = this.running.get(id);
    if (active) return active;
    return this.execute(routine, "manual");
  }

  async tick() {
    if (this.ticking) return this.ticking;
    this.ticking = this.tickOnce().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  async idle() {
    await this.ticking;
    await Promise.allSettled(
      [...this.running.values()].map((active) => active.done),
    );
  }

  private async tickOnce() {
    const now = this.now();
    const since = new Date(now.getTime() - ROUTINE_RUN_WINDOW_MS).toISOString();
    for (const routine of this.deps.repository.list()) {
      const decision = routineDecision(
        {
          nextRunAt: routine.nextRunAt,
          paused: routine.pausedReason !== null,
          running: this.running.has(routine.id),
          recentRuns: this.deps.repository.countRunsSince(routine.id, since),
        },
        now,
      );
      if (decision.kind === "run") {
        void this.execute(routine, decision.trigger);
      } else if (decision.kind === "skip") {
        this.skip(routine, now);
      }
    }
  }

  private skip(routine: RoutineRecord, now: Date) {
    const at = now.toISOString();
    this.deps.repository.saveRun({
      id: crypto.randomUUID(),
      routineId: routine.id,
      sessionId: routine.sessionId,
      trigger: "schedule",
      status: "skipped",
      summary: null,
      error: "The daily run limit was reached.",
      startedAt: at,
      finishedAt: at,
    });
    this.deps.repository.upsert({
      ...routine,
      nextRunAt: routineNextRunAt(
        routine.schedule,
        routine.timeZone,
        now,
      ).toISOString(),
      updatedAt: at,
    });
    this.deps.announceChanged();
  }

  private execute(routine: RoutineRecord, trigger: RoutineRunTrigger) {
    const startedAt = this.now().toISOString();
    const run: RoutineRunRecord = {
      id: crypto.randomUUID(),
      routineId: routine.id,
      sessionId: routine.sessionId,
      trigger,
      status: "running",
      summary: null,
      error: null,
      startedAt,
      finishedAt: null,
    };
    this.deps.repository.saveRun(run);
    this.deps.announceChanged();
    const done = this.perform(routine, run).finally(() => {
      this.running.delete(routine.id);
    });
    const active = { run, done };
    this.running.set(routine.id, active);
    return active;
  }

  private async perform(routine: RoutineRecord, started: RoutineRunRecord) {
    let run = started;
    let outcome: SessionTurnOutcome;
    try {
      const sessionId = await this.deps.ensureSession(routine);
      run = { ...run, sessionId };
      this.deps.repository.saveRun(run);
      outcome = await this.deps.runTurn(routine, sessionId);
    } catch (error) {
      outcome = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return this.finish(routine.id, run, outcome);
  }

  private async finish(
    routineId: string,
    started: RoutineRunRecord,
    outcome: SessionTurnOutcome,
  ) {
    const now = this.now();
    const at = now.toISOString();
    const succeeded = outcome.status === "completed";
    let error: string | null = null;
    if (outcome.status === "failed") error = outcome.error;
    if (outcome.status === "cancelled") error = "The run was cancelled.";
    const run: RoutineRunRecord = {
      ...started,
      status: succeeded ? "succeeded" : "failed",
      summary: succeeded ? summarize(outcome.message) : null,
      error,
      finishedAt: at,
    };
    this.deps.repository.saveRun(run);
    const routine = this.deps.repository.getById(routineId);
    if (!routine) return run;
    const failureCount = succeeded ? 0 : routine.failureCount + 1;
    const nextRunAt = succeeded
      ? routineNextRunAt(routine.schedule, routine.timeZone, now)
      : new Date(now.getTime() + routineBackoffMs(failureCount));
    const updated: RoutineRecord = {
      ...routine,
      sessionId: run.sessionId ?? routine.sessionId,
      lastRunAt: at,
      failureCount,
      nextRunAt: nextRunAt.toISOString(),
      pausedReason:
        failureCount >= ROUTINE_MAX_FAILURES
          ? "failures"
          : routine.pausedReason,
      updatedAt: at,
    };
    this.deps.repository.upsert(updated);
    this.deps.announceChanged();
    return run;
  }

  private checkSchedule(schedule: RoutineRecord["schedule"]) {
    const error = routineScheduleError(schedule);
    if (error) throw new Error(error);
  }

  private checkTimeZone(timeZone: string | undefined) {
    const zone =
      timeZone ??
      this.deps.defaultTimeZone?.() ??
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!isValidTimeZone(zone)) {
      throw new Error(`Unknown time zone: ${zone}`);
    }
    return zone;
  }

  private require(id: string) {
    const routine = this.deps.repository.getById(id);
    if (!routine) throw new Error(`Routine ${id} was not found`);
    return routine;
  }
}
