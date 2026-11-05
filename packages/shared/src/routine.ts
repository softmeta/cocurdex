export type RoutineSchedule =
  | { kind: "interval"; minutes: number }
  | { kind: "daily"; time: string; weekdays: number[] | null };

export type RoutineAccess = "read-and-draft" | "ask" | "full";

export type RoutineDeliver = "inbox" | "push" | "silent";

export type RoutinePausedReason = "user" | "failures";

export type RoutineRunTrigger = "schedule" | "catch-up" | "manual";

export type RoutineRunStatus = "running" | "succeeded" | "failed" | "skipped";

export interface RoutineRecord {
  id: string;
  agentId: string;
  name: string;
  prompt: string;
  schedule: RoutineSchedule;
  timeZone: string;
  access: RoutineAccess;
  deliver: RoutineDeliver;
  pausedReason: RoutinePausedReason | null;
  sessionId: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineRunRecord {
  id: string;
  routineId: string;
  sessionId: string | null;
  trigger: RoutineRunTrigger;
  status: RoutineRunStatus;
  summary: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CreateRoutinePayload {
  agentId: string;
  name: string;
  prompt: string;
  schedule: RoutineSchedule;
  timeZone?: string;
  access?: RoutineAccess;
  deliver?: RoutineDeliver;
}

export interface UpdateRoutinePayload {
  id: string;
  name?: string;
  prompt?: string;
  schedule?: RoutineSchedule;
  timeZone?: string;
  access?: RoutineAccess;
  deliver?: RoutineDeliver;
  paused?: boolean;
}

export const ROUTINE_ACCESS_VALUES = [
  "read-and-draft",
  "ask",
  "full",
] as const satisfies readonly RoutineAccess[];

export const ROUTINE_DELIVER_VALUES = [
  "inbox",
  "push",
  "silent",
] as const satisfies readonly RoutineDeliver[];

export const ROUTINE_MIN_INTERVAL_MINUTES = 5;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseRoutineTime(time: string) {
  const match = TIME_PATTERN.exec(time);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

export function routineScheduleError(schedule: RoutineSchedule) {
  if (schedule.kind === "interval") {
    return Number.isInteger(schedule.minutes) &&
      schedule.minutes >= ROUTINE_MIN_INTERVAL_MINUTES
      ? null
      : `The interval must be a whole number of minutes, at least ${ROUTINE_MIN_INTERVAL_MINUTES}.`;
  }
  if (!parseRoutineTime(schedule.time)) {
    return "The time must be HH:MM in 24-hour form.";
  }
  const weekdays = schedule.weekdays;
  if (
    weekdays &&
    (weekdays.length === 0 ||
      weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
  ) {
    return "Weekdays must be a non-empty list of 0 (Sunday) to 6 (Saturday).";
  }
  return null;
}
