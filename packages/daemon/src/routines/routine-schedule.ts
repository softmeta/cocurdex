import {
  parseRoutineTime,
  type RoutineRunTrigger,
  type RoutineSchedule,
} from "@cocurdex/shared";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const BACKOFF_BASE_MS = 15 * MINUTE_MS;
const BACKOFF_MAX_MS = 4 * 60 * MINUTE_MS;
const CATCH_UP_GRACE_MS = 5 * MINUTE_MS;

export const ROUTINE_DAILY_RUN_LIMIT = 24;
export const ROUTINE_MAX_FAILURES = 3;
export const ROUTINE_RUN_WINDOW_MS = DAY_MS;

interface ZonedDate {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: WEEKDAYS.indexOf(value("weekday")),
  };
}

function offsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function wallTimeToUtc(
  date: ZonedDate,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

function zonedDay(date: Date, timeZone: string): ZonedDate {
  const { year, month, day, weekday } = zonedParts(date, timeZone);
  return { year, month, day, weekday };
}

function nextDailyRun(
  schedule: Extract<RoutineSchedule, { kind: "daily" }>,
  timeZone: string,
  after: Date,
) {
  const time = parseRoutineTime(schedule.time);
  if (!time) throw new Error(`Invalid routine time ${schedule.time}`);
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = zonedDay(new Date(after.getTime() + offset * DAY_MS), timeZone);
    if (schedule.weekdays && !schedule.weekdays.includes(day.weekday)) {
      continue;
    }
    const candidate = wallTimeToUtc(day, time.hour, time.minute, timeZone);
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  throw new Error("The routine schedule never runs");
}

export function routineNextRunAt(
  schedule: RoutineSchedule,
  timeZone: string,
  after: Date,
) {
  if (schedule.kind === "interval") {
    return new Date(after.getTime() + schedule.minutes * MINUTE_MS);
  }
  return nextDailyRun(schedule, timeZone, after);
}

export function routineBackoffMs(failureCount: number) {
  const exponent = Math.max(0, failureCount - 1);
  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
}

export type RoutineDecision =
  | { kind: "wait" }
  | { kind: "run"; trigger: RoutineRunTrigger }
  | { kind: "skip"; reason: "limit" };

export function routineDecision(
  state: {
    nextRunAt: string | null;
    paused: boolean;
    running: boolean;
    recentRuns: number;
  },
  now: Date,
): RoutineDecision {
  if (state.paused || state.running || !state.nextRunAt) {
    return { kind: "wait" };
  }
  const due = Date.parse(state.nextRunAt);
  if (!Number.isFinite(due) || due > now.getTime()) return { kind: "wait" };
  if (state.recentRuns >= ROUTINE_DAILY_RUN_LIMIT) {
    return { kind: "skip", reason: "limit" };
  }
  return {
    kind: "run",
    trigger: now.getTime() - due > CATCH_UP_GRACE_MS ? "catch-up" : "schedule",
  };
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
