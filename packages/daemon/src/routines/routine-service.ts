import crypto from "node:crypto";
import type { RoutineRepository } from "@cocurdex/db";
import {
  type CreateRoutinePayload,
  type MessageRecord,
  ROUTINE_ACCESS_VALUES,
  ROUTINE_DELIVER_VALUES,
  type RoutineRecord,
  type RoutineReport,
  type RoutineRunRecord,
  type RoutineRunTrigger,
  routineReportNeedsUser,
  routineScheduleError,
  type UpdateRoutinePayload,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";
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
  deliverResult(
    routine: RoutineRecord,
    run: RoutineRunRecord,
    content: string,
  ): Promise<void>;
  alertRun?(run: RoutineRunRecord): Promise<void>;
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

interface RoutineSessionRun {
  routineId: string;
  runId: string;
  report: RoutineReport | null;
}

interface RoutineRunResult {
  status: RoutineRunRecord["status"];
  summary: string | null;
  error: string | null;
  outcome: RoutineReport["status"] | null;
  question: string | null;
}

function runResult(
  outcome: SessionTurnOutcome,
  report: RoutineReport | null,
): RoutineRunResult {
  if (outcome.status === "failed") {
    return failedResult(outcome.error, report);
  }
  if (outcome.status === "cancelled") {
    return failedResult("The run was cancelled.", report);
  }
  if (!report) {
    return {
      status: "succeeded",
      summary: summarize(outcome.message),
      error: null,
      outcome: null,
      question: null,
    };
  }
  return {
    status: report.status === "failed" ? "failed" : "succeeded",
    summary: report.summary,
    error: report.status === "failed" ? report.summary : null,
    outcome: report.status,
    question: report.question,
  };
}

function failedResult(
  error: string,
  report: RoutineReport | null,
): RoutineRunResult {
  return {
    status: "failed",
    summary: report?.summary ?? null,
    error,
    outcome: report?.status ?? null,
    question: report?.question ?? null,
  };
}

function deliveredContent(
  routine: RoutineRecord,
  outcome: SessionTurnOutcome,
  result: RoutineRunResult,
) {
  if (result.status !== "succeeded" || result.outcome === "dropped") {
    return "";
  }
  if (result.outcome === null) {
    if (routine.deliver === "silent") return "";
    return outcome.status === "completed" ? outcome.message.content.trim() : "";
  }
  if (!routineReportNeedsUser(result.outcome) && routine.deliver === "silent") {
    return "";
  }
  return [result.summary, result.question]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

export class RoutineService {
  private readonly now: () => Date;
  private readonly running = new Map<string, RoutineActiveRun>();
  private readonly sessionRuns = new Map<string, RoutineSessionRun>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking: Promise<void> | null = null;

  constructor(private readonly deps: RoutineServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  start() {
    const now = this.now();
    const at = now.toISOString();
    for (const run of this.deps.repository.listRunning()) {
      this.deps.repository.saveRun({
        ...run,
        status: "failed",
        error: "The daemon stopped during the run.",
        finishedAt: at,
      });
      const routine = this.deps.repository.getById(run.routineId);
      if (!routine) continue;
      this.deps.repository.upsert({
        ...routine,
        sessionId: run.sessionId ?? routine.sessionId,
        nextRunAt: routineNextRunAt(
          routine.schedule,
          routine.timeZone,
          now,
        ).toISOString(),
        updatedAt: at,
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

  runsFinishedSince(since: string) {
    return this.deps.repository.listFinishedRunsSince(since);
  }

  findBySession(sessionId: string) {
    return this.deps.repository.findBySession(sessionId);
  }

  sessionIds(routineId: string) {
    return this.deps.repository.listSessionIds(routineId);
  }

  runningRoutine(sessionId: string) {
    const active = this.sessionRuns.get(sessionId);
    return active ? this.deps.repository.getById(active.routineId) : null;
  }

  isReporting(sessionId: string) {
    const active = this.sessionRuns.get(sessionId);
    return active !== undefined && active.report === null;
  }

  report(sessionId: string, report: RoutineReport) {
    const active = this.sessionRuns.get(sessionId);
    if (!active) throw new Error("This session is not running a routine");
    if (active.report) {
      throw new Error("This run already has a report");
    }
    this.sessionRuns.set(sessionId, { ...active, report });
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
      outcome: null,
      question: null,
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
      outcome: null,
      question: null,
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
    let report: RoutineReport | null = null;
    let sessionId: string | null = null;
    try {
      sessionId = await this.deps.ensureSession(routine);
      run = { ...run, sessionId };
      this.deps.repository.saveRun(run);
      this.sessionRuns.set(sessionId, {
        routineId: routine.id,
        runId: run.id,
        report: null,
      });
      outcome = await this.deps.runTurn(routine, sessionId);
    } catch (error) {
      outcome = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (sessionId) {
        report = this.sessionRuns.get(sessionId)?.report ?? null;
        this.sessionRuns.delete(sessionId);
      }
    }
    return this.finish(routine.id, run, outcome, report);
  }

  private async finish(
    routineId: string,
    started: RoutineRunRecord,
    outcome: SessionTurnOutcome,
    report: RoutineReport | null,
  ) {
    const now = this.now();
    const at = now.toISOString();
    const result = runResult(outcome, report);
    const succeeded = result.status === "succeeded";
    const run: RoutineRunRecord = { ...started, ...result, finishedAt: at };
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
    await this.deps.alertRun?.(run);
    const content = deliveredContent(routine, outcome, result);
    if (content) {
      await this.deps.deliverResult(routine, run, content).catch((error) =>
        logDaemonDiagnostic("warn", "routine.deliverFailed", {
          routineId: routine.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
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
