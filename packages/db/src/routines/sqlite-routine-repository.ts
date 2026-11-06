import type { DatabaseSync } from "node:sqlite";
import {
  ROUTINE_ACCESS_VALUES,
  ROUTINE_DELIVER_VALUES,
  ROUTINE_REPORT_STATUSES,
  type RoutineAccess,
  type RoutineDeliver,
  type RoutinePausedReason,
  type RoutineRecord,
  type RoutineRunRecord,
  type RoutineRunStatus,
  type RoutineRunTrigger,
  type RoutineSchedule,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import type { RoutineRepository } from "./routine-repository";

const RUN_TRIGGERS: readonly RoutineRunTrigger[] = [
  "schedule",
  "catch-up",
  "manual",
];
const RUN_STATUSES: readonly RoutineRunStatus[] = [
  "running",
  "succeeded",
  "failed",
  "skipped",
];

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function oneOf<T extends string>(
  values: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function parseSchedule(json: unknown): RoutineSchedule {
  try {
    const value = JSON.parse(String(json)) as Partial<{
      kind: string;
      minutes: number;
      time: string;
      weekdays: number[] | null;
    }>;
    if (value.kind === "interval" && typeof value.minutes === "number") {
      return { kind: "interval", minutes: value.minutes };
    }
    if (value.kind === "daily" && typeof value.time === "string") {
      return {
        kind: "daily",
        time: value.time,
        weekdays: Array.isArray(value.weekdays) ? value.weekdays : null,
      };
    }
  } catch {}
  return { kind: "daily", time: "09:00", weekdays: null };
}

function pausedReason(value: unknown): RoutinePausedReason | null {
  return value === "user" || value === "failures" ? value : null;
}

function mapRoutine(row: SqliteRow): RoutineRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    name: String(row.name),
    prompt: String(row.prompt),
    schedule: parseSchedule(row.schedule_json),
    timeZone: String(row.time_zone),
    access: oneOf<RoutineAccess>(
      ROUTINE_ACCESS_VALUES,
      row.access,
      "read-and-draft",
    ),
    deliver: oneOf<RoutineDeliver>(
      ROUTINE_DELIVER_VALUES,
      row.deliver,
      "inbox",
    ),
    pausedReason: pausedReason(row.paused_reason),
    sessionId: nullableString(row.session_id),
    nextRunAt: nullableString(row.next_run_at),
    lastRunAt: nullableString(row.last_run_at),
    failureCount: Number(row.failure_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRun(row: SqliteRow): RoutineRunRecord {
  return {
    id: String(row.id),
    routineId: String(row.routine_id),
    sessionId: nullableString(row.session_id),
    trigger: oneOf(RUN_TRIGGERS, row.trigger, "schedule"),
    status: oneOf(RUN_STATUSES, row.status, "failed"),
    summary: nullableString(row.summary),
    error: nullableString(row.error),
    outcome:
      ROUTINE_REPORT_STATUSES.find((status) => status === row.outcome) ?? null,
    question: nullableString(row.question),
    startedAt: String(row.started_at),
    finishedAt: nullableString(row.finished_at),
  };
}

export function createSqliteRoutineRepository(
  database: DatabaseSync,
): RoutineRepository {
  const routines = (sql: string, ...values: string[]) =>
    (database.prepare(sql).all(...values) as SqliteRow[]).map(mapRoutine);
  const runs = (sql: string, ...values: (string | number)[]) =>
    (database.prepare(sql).all(...values) as SqliteRow[]).map(mapRun);
  return {
    list() {
      return routines("SELECT * FROM routines ORDER BY created_at ASC, id ASC");
    },
    listByAgent(agentId) {
      return routines(
        "SELECT * FROM routines WHERE agent_id = ? ORDER BY created_at ASC, id ASC",
        agentId,
      );
    },
    getById(id) {
      return routines("SELECT * FROM routines WHERE id = ?", id)[0] ?? null;
    },
    findBySession(sessionId) {
      return (
        routines(
          `SELECT * FROM routines
           WHERE session_id = ?
              OR id IN (SELECT routine_id FROM routine_runs WHERE session_id = ?)
           LIMIT 1`,
          sessionId,
          sessionId,
        )[0] ?? null
      );
    },
    listSessionIds(routineId) {
      const rows = database
        .prepare(
          `SELECT session_id FROM routines WHERE id = ? AND session_id IS NOT NULL
           UNION
           SELECT session_id FROM routine_runs WHERE routine_id = ? AND session_id IS NOT NULL`,
        )
        .all(routineId, routineId) as SqliteRow[];
      return rows.map((row) => String(row.session_id));
    },
    upsert(routine) {
      database
        .prepare(
          `INSERT INTO routines (
             id, agent_id, name, prompt, schedule_json, time_zone, access,
             deliver, paused_reason, session_id, next_run_at, last_run_at,
             failure_count, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             prompt = excluded.prompt,
             schedule_json = excluded.schedule_json,
             time_zone = excluded.time_zone,
             access = excluded.access,
             deliver = excluded.deliver,
             paused_reason = excluded.paused_reason,
             session_id = excluded.session_id,
             next_run_at = excluded.next_run_at,
             last_run_at = excluded.last_run_at,
             failure_count = excluded.failure_count,
             updated_at = excluded.updated_at`,
        )
        .run(
          routine.id,
          routine.agentId,
          routine.name,
          routine.prompt,
          JSON.stringify(routine.schedule),
          routine.timeZone,
          routine.access,
          routine.deliver,
          routine.pausedReason,
          routine.sessionId,
          routine.nextRunAt,
          routine.lastRunAt,
          routine.failureCount,
          routine.createdAt,
          routine.updatedAt,
        );
    },
    delete(id) {
      database.prepare("DELETE FROM routine_runs WHERE routine_id = ?").run(id);
      database.prepare("DELETE FROM routines WHERE id = ?").run(id);
    },
    listRuns(routineId, limit) {
      return routineId
        ? runs(
            "SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC, id DESC LIMIT ?",
            routineId,
            limit,
          )
        : runs(
            "SELECT * FROM routine_runs ORDER BY started_at DESC, id DESC LIMIT ?",
            limit,
          );
    },
    getRun(id) {
      return runs("SELECT * FROM routine_runs WHERE id = ?", id)[0] ?? null;
    },
    saveRun(run) {
      database
        .prepare(
          `INSERT INTO routine_runs (
             id, routine_id, session_id, trigger, status, summary, error,
             outcome, question, started_at, finished_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             session_id = excluded.session_id,
             status = excluded.status,
             summary = excluded.summary,
             error = excluded.error,
             outcome = excluded.outcome,
             question = excluded.question,
             finished_at = excluded.finished_at`,
        )
        .run(
          run.id,
          run.routineId,
          run.sessionId,
          run.trigger,
          run.status,
          run.summary,
          run.error,
          run.outcome,
          run.question,
          run.startedAt,
          run.finishedAt,
        );
    },
    countRunsSince(routineId, since) {
      const row = database
        .prepare(
          "SELECT COUNT(*) AS count FROM routine_runs WHERE routine_id = ? AND started_at >= ? AND status != 'skipped'",
        )
        .get(routineId, since) as SqliteRow | undefined;
      return Number(row?.count ?? 0);
    },
    listRunning() {
      return runs("SELECT * FROM routine_runs WHERE status = 'running'");
    },
    latestFinishedRuns() {
      return runs(
        `SELECT * FROM (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY routine_id ORDER BY started_at DESC, id DESC
           ) AS position
           FROM routine_runs
           WHERE status IN ('succeeded', 'failed')
         ) WHERE position = 1`,
      );
    },
    listFinishedRunsSince(since) {
      return runs(
        "SELECT * FROM routine_runs WHERE status IN ('succeeded', 'failed') AND finished_at >= ? ORDER BY finished_at DESC, id DESC",
        since,
      );
    },
  };
}
