import { readFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type CreateRoutinePayload,
  ROUTINE_ACCESS_VALUES,
  ROUTINE_DELIVER_VALUES,
  type RoutineAccess,
  type RoutineDeliver,
  type RoutineRecord,
  type RoutineRunRecord,
  type RoutineSchedule,
  type UpdateRoutinePayload,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  getRequiredFlag,
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";
import { findPersonaByRef } from "./persona-commands";

const POLL_INTERVAL_MS = 500;
const DEFAULT_WAIT_SECONDS = 600;
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_GROUPS: Record<string, number[]> = {
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
};

export function routineUsageLines() {
  const fields =
    "[--prompt <text>|--prompt-file <path>] [--every <minutes>|--at <HH:MM> [--days <mon,wed|weekdays|weekends>]] [--tz <zone>] [--access read-and-draft|full] [--deliver inbox|push|silent]";
  return [
    "  cocurdex routine list [--persona <persona>] [--json]",
    "  cocurdex routine show <routine> [--json]",
    `  cocurdex routine create --persona <persona> --name <name> ${fields} [--json]`,
    `  cocurdex routine update <routine> [--name <name>] ${fields} [--json]`,
    "  cocurdex routine pause|resume <routine> [--json]",
    "  cocurdex routine run <routine> [--wait] [--timeout <seconds>] [--json]",
    "  cocurdex routine runs [<routine>] [--limit <n>] [--json]",
    "  cocurdex routine delete <routine>",
  ];
}

function describeSchedule(schedule: RoutineSchedule) {
  if (schedule.kind === "interval") return `every ${schedule.minutes}m`;
  const days = schedule.weekdays
    ? ` ${schedule.weekdays.map((day) => DAY_NAMES[day]).join(",")}`
    : "";
  return `${schedule.time}${days}`;
}

function routineRow(routine: RoutineRecord) {
  return {
    id: routine.id,
    name: routine.name,
    schedule: describeSchedule(routine.schedule),
    timeZone: routine.timeZone,
    access: routine.access,
    deliver: routine.deliver,
    paused: routine.pausedReason ?? "",
    nextRunAt: routine.nextRunAt ?? "",
    lastRunAt: routine.lastRunAt ?? "",
  };
}

function runRow(run: RoutineRunRecord) {
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? "",
    summary: run.summary ?? run.error ?? "",
  };
}

function parseDays(value: string) {
  const group = DAY_GROUPS[value.toLowerCase()];
  if (group) return group;
  const days = value.split(",").map((part) => {
    const token = part.trim().toLowerCase();
    const named = DAY_NAMES.findIndex((day) => token.startsWith(day));
    const number = Number(token);
    if (named >= 0) return named;
    if (Number.isInteger(number) && number >= 0 && number <= 6) return number;
    throw new Error(`Unknown day: ${part}`);
  });
  return [...new Set(days)].sort((a, b) => a - b);
}

function scheduleFlags(parsed: ParsedArgs): RoutineSchedule | undefined {
  const every = stringFlag(parsed, "every");
  const at = stringFlag(parsed, "at");
  const days = stringFlag(parsed, "days");
  if (every !== undefined && at !== undefined) {
    throw new Error("Pass either --every or --at");
  }
  if (days !== undefined && at === undefined) {
    throw new Error("--days needs --at");
  }
  if (every !== undefined) {
    const minutes = Number(every);
    if (!Number.isInteger(minutes)) {
      throw new Error("--every must be a whole number of minutes");
    }
    return { kind: "interval", minutes };
  }
  if (at !== undefined) {
    return {
      kind: "daily",
      time: at,
      weekdays: days === undefined ? null : parseDays(days),
    };
  }
  return undefined;
}

function choiceFlag<T extends string>(
  parsed: ParsedArgs,
  name: string,
  values: readonly T[],
): T | undefined {
  const value = stringFlag(parsed, name);
  if (value === undefined) return undefined;
  if (!values.includes(value as T)) {
    throw new Error(`--${name} must be one of ${values.join(", ")}`);
  }
  return value as T;
}

async function promptFlag(parsed: ParsedArgs) {
  const file = stringFlag(parsed, "prompt-file");
  if (file) return readFile(file, "utf8");
  return stringFlag(parsed, "prompt");
}

function editableFlags(parsed: ParsedArgs) {
  return {
    schedule: scheduleFlags(parsed),
    timeZone: stringFlag(parsed, "tz"),
    access: choiceFlag<RoutineAccess>(parsed, "access", ROUTINE_ACCESS_VALUES),
    deliver: choiceFlag<RoutineDeliver>(
      parsed,
      "deliver",
      ROUTINE_DELIVER_VALUES,
    ),
  };
}

function resolveRoutine(routines: readonly RoutineRecord[], ref: string) {
  const exact = routines.find((routine) => routine.id === ref);
  if (exact) return exact;
  const lowered = ref.toLocaleLowerCase();
  const matches = routines.filter(
    (routine) =>
      routine.id.startsWith(ref) ||
      routine.name.toLocaleLowerCase() === lowered,
  );
  if (matches.length === 1 && matches[0]) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Routine "${ref}" is ambiguous: ${matches.map((routine) => routine.id).join(", ")}`,
    );
  }
  throw new Error(`Routine "${ref}" was not found`);
}

async function findRoutine(args: string[], usage: string) {
  const ref = args[0];
  if (!ref) throw new Error(`Usage: ${usage}`);
  return resolveRoutine(await requestDaemon("routine.list", {}), ref);
}

function positiveNumberFlag(
  parsed: ParsedArgs,
  name: string,
  fallback: number,
) {
  const value = stringFlag(parsed, name);
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return number;
}

async function waitForRun(run: RoutineRunRecord, timeoutSeconds: number) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const runs = await requestDaemon("routine.runs", {
      routineId: run.routineId,
      limit: 20,
    });
    const current = runs.find((candidate) => candidate.id === run.id);
    if (current && current.status !== "running") return current;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `The run did not finish within ${timeoutSeconds}s; check it later with routine runs`,
  );
}

async function createRoutine(parsed: ParsedArgs) {
  const personaRef = getRequiredFlag(parsed, "persona");
  const name = getRequiredFlag(parsed, "name");
  const prompt = await promptFlag(parsed);
  if (prompt === undefined) throw new Error("Pass --prompt or --prompt-file");
  const { schedule, ...rest } = editableFlags(parsed);
  if (!schedule) throw new Error("Pass --every <minutes> or --at <HH:MM>");
  return withDaemon(async () => {
    const persona = await findPersonaByRef(personaRef);
    const payload: CreateRoutinePayload = {
      agentId: persona.id,
      name,
      prompt,
      schedule,
      ...rest,
    };
    return requestDaemon("routine.create", payload);
  });
}

async function updateRoutine(
  args: string[],
  parsed: ParsedArgs,
  paused?: boolean,
) {
  const prompt = await promptFlag(parsed);
  const changes = editableFlags(parsed);
  return withDaemon(async () => {
    const routine = await findRoutine(
      args,
      "cocurdex routine update <routine>",
    );
    const payload: UpdateRoutinePayload = {
      id: routine.id,
      name: stringFlag(parsed, "name"),
      prompt,
      ...changes,
      paused,
    };
    return requestDaemon("routine.update", payload);
  });
}

async function runRoutine(args: string[], parsed: ParsedArgs) {
  const timeout = positiveNumberFlag(parsed, "timeout", DEFAULT_WAIT_SECONDS);
  const run = await withDaemon(async () => {
    const routine = await findRoutine(args, "cocurdex routine run <routine>");
    const started = await requestDaemon("routine.run", { id: routine.id });
    return parsed.flags.has("wait") ? waitForRun(started, timeout) : started;
  });
  if (!parsed.flags.has("json") && run.status !== "running") {
    console.log(run.summary ?? run.error ?? run.status);
    if (run.status === "failed") process.exitCode = 1;
    return;
  }
  printResult(run, parsed);
}

async function listRuns(args: string[], parsed: ParsedArgs) {
  const limit = positiveNumberFlag(parsed, "limit", 20);
  const runs = await withDaemon(async () => {
    const routine = args[0]
      ? await findRoutine(args, "cocurdex routine runs [<routine>]")
      : null;
    return requestDaemon("routine.runs", {
      routineId: routine?.id ?? null,
      limit,
    });
  });
  if (parsed.flags.has("json")) {
    printResult(runs, parsed);
    return;
  }
  printRows(
    runs.map(runRow),
    ["status", "trigger", "startedAt", "summary"],
    parsed,
  );
}

export async function handleRoutineCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "list" || action === undefined) {
    const personaRef = stringFlag(parsed, "persona");
    const routines = await withDaemon(async () => {
      const agentId = personaRef
        ? (await findPersonaByRef(personaRef)).id
        : null;
      return requestDaemon("routine.list", { agentId });
    });
    if (parsed.flags.has("json")) {
      printResult(routines, parsed);
      return true;
    }
    printRows(
      routines.map(routineRow),
      ["id", "name", "schedule", "access", "paused", "nextRunAt"],
      parsed,
    );
    return true;
  }
  if (action === "show") {
    const routine = await withDaemon(() =>
      findRoutine(args, "cocurdex routine show <routine>"),
    );
    printResult(routine, parsed);
    return true;
  }
  if (action === "create") {
    printResult(await createRoutine(parsed), parsed);
    return true;
  }
  if (action === "update") {
    printResult(await updateRoutine(args, parsed), parsed);
    return true;
  }
  if (action === "pause" || action === "resume") {
    printResult(await updateRoutine(args, parsed, action === "pause"), parsed);
    return true;
  }
  if (action === "run") {
    await runRoutine(args, parsed);
    return true;
  }
  if (action === "runs") {
    await listRuns(args, parsed);
    return true;
  }
  if (action === "delete") {
    const deleted = await withDaemon(async () => {
      const routine = await findRoutine(
        args,
        "cocurdex routine delete <routine>",
      );
      await requestDaemon("routine.delete", { id: routine.id });
      return { deleted: routine.id };
    });
    printResult(deleted, parsed);
    return true;
  }
  return false;
}
