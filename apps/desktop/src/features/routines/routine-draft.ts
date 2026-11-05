import {
  type RoutineAccess,
  type RoutineDeliver,
  type RoutineRecord,
  type RoutineSchedule,
  routineScheduleError,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";

export type RoutineScheduleKind = RoutineSchedule["kind"];

export interface RoutineDraft {
  agentId: string;
  name: string;
  prompt: string;
  kind: RoutineScheduleKind;
  minutes: string;
  time: string;
  weekdays: number[];
  timeZone: string;
  access: RoutineAccess;
  deliver: RoutineDeliver;
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WORKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

export const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function emptyRoutineDraft(agentId: string): RoutineDraft {
  return {
    agentId,
    name: "",
    prompt: "",
    kind: "daily",
    minutes: "60",
    time: "08:00",
    weekdays: EVERY_DAY,
    timeZone: hostTimeZone,
    access: "read-and-draft",
    deliver: "inbox",
  };
}

export function routineDraft(routine: RoutineRecord): RoutineDraft {
  const { schedule } = routine;
  return {
    ...emptyRoutineDraft(routine.agentId),
    name: routine.name,
    prompt: routine.prompt,
    kind: schedule.kind,
    minutes: schedule.kind === "interval" ? String(schedule.minutes) : "60",
    time: schedule.kind === "daily" ? schedule.time : "08:00",
    weekdays:
      schedule.kind === "daily" && schedule.weekdays
        ? schedule.weekdays
        : EVERY_DAY,
    timeZone: routine.timeZone,
    access: routine.access,
    deliver: routine.deliver,
  };
}

export function draftSchedule(draft: RoutineDraft): RoutineSchedule {
  if (draft.kind === "interval") {
    return { kind: "interval", minutes: Number(draft.minutes) };
  }
  const weekdays = [...draft.weekdays].sort();
  return {
    kind: "daily",
    time: draft.time,
    weekdays: weekdays.length === EVERY_DAY.length ? null : weekdays,
  };
}

export function draftComplete(draft: RoutineDraft) {
  return (
    draft.agentId !== "" &&
    draft.name.trim() !== "" &&
    draft.prompt.trim() !== "" &&
    draft.timeZone.trim() !== "" &&
    draft.weekdays.length > 0 &&
    routineScheduleError(draftSchedule(draft)) === null
  );
}

function sameDays(left: number[], right: number[]) {
  return (
    left.length === right.length && left.every((day, i) => day === right[i])
  );
}

function weekdayNames(weekdays: number[], language: string) {
  const format = new Intl.DateTimeFormat(language, {
    weekday: "short",
    timeZone: "UTC",
  });
  return weekdays
    .map((day) => format.format(new Date(Date.UTC(2026, 0, 4 + day))))
    .join(", ");
}

export function weekdayLabel(day: number, language: string) {
  return weekdayNames([day], language);
}

export const WEEKDAYS = EVERY_DAY;

export function describeSchedule(
  t: TFunction<"personal">,
  schedule: RoutineSchedule,
  language: string,
) {
  if (schedule.kind === "interval") {
    return t("routines.schedule.every", { minutes: schedule.minutes });
  }
  const days = schedule.weekdays ?? EVERY_DAY;
  if (sameDays(days, EVERY_DAY)) {
    return t("routines.schedule.daily", { time: schedule.time });
  }
  if (sameDays(days, WORKDAYS)) {
    return t("routines.schedule.weekdays", { time: schedule.time });
  }
  if (sameDays(days, WEEKEND)) {
    return t("routines.schedule.weekends", { time: schedule.time });
  }
  return t("routines.schedule.days", {
    days: weekdayNames(days, language),
    time: schedule.time,
  });
}
