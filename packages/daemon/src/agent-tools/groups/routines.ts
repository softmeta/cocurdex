import type {
  AgentToolCallerContext,
  CreateRoutinePayload,
  RoutineRecord,
  RoutineRunRecord,
  RoutineSchedule,
  UpdateRoutinePayload,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export interface RoutineToolDependencies {
  personaOf(sessionId: string): Promise<string | null>;
  list(agentId: string): RoutineRecord[];
  get(id: string): RoutineRecord | null;
  create(payload: CreateRoutinePayload): Promise<RoutineRecord>;
  update(payload: UpdateRoutinePayload): RoutineRecord;
  delete(id: string): void;
  run(id: string): RoutineRunRecord;
  runs(routineId: string, limit: number): RoutineRunRecord[];
}

const AGENT_ACCESS = ["read-and-draft", "ask"] as const;
const DELIVER = ["inbox", "push", "silent"] as const;

const scheduleSchema = {
  type: "object",
  description:
    'When to run. {"kind":"interval","minutes":60} repeats every N minutes (at least 5). {"kind":"daily","time":"08:00","weekdays":[1,2,3,4,5]} runs at a wall-clock time; weekdays use 0 = Sunday, null = every day.',
  properties: {
    kind: { type: "string", enum: ["interval", "daily"] },
    minutes: { type: "integer" },
    time: { type: "string" },
    weekdays: { type: ["array", "null"], items: { type: "integer" } },
  },
  required: ["kind"],
};

const editableProperties = {
  name: { type: "string", description: "Short name shown to the user" },
  prompt: {
    type: "string",
    description:
      "What you will be asked on every run. Write it as a self-contained instruction to yourself.",
  },
  schedule: scheduleSchema,
  timeZone: {
    type: "string",
    description: "IANA time zone such as Asia/Shanghai; defaults to the host's",
  },
  access: {
    type: "string",
    enum: [...AGENT_ACCESS],
    description:
      "read-and-draft (default) reads and drafts without side effects; ask pauses for the user's approval before acting. Only the user can grant full access.",
  },
  deliver: {
    type: "string",
    enum: [...DELIVER],
    description:
      "inbox (default) records the result quietly; push also notifies the phone; silent only records. Approvals and questions always notify.",
  },
};

function parseSchedule(value: unknown): RoutineSchedule | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const input = value as Record<string, unknown>;
  if (input.kind === "interval") {
    return { kind: "interval", minutes: Number(input.minutes) };
  }
  if (input.kind === "daily") {
    return {
      kind: "daily",
      time: String(input.time ?? ""),
      weekdays: Array.isArray(input.weekdays)
        ? input.weekdays.map(Number)
        : null,
    };
  }
  throw new Error("schedule.kind must be interval or daily");
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function oneOf<T extends string>(values: readonly T[], value: unknown) {
  return values.includes(value as T) ? (value as T) : undefined;
}

export function registerRoutineTools(
  registry: AgentToolRegistry,
  deps: RoutineToolDependencies,
) {
  const isPersonal = (caller: AgentToolCallerContext) =>
    caller.sessionKind === "personal";

  async function persona(caller: AgentToolCallerContext) {
    const agentId = await deps.personaOf(caller.sessionId);
    if (!agentId) {
      throw new Error("Routines are only available to personal assistants");
    }
    return agentId;
  }

  async function owned(caller: AgentToolCallerContext, id: unknown) {
    const agentId = await persona(caller);
    const routine = deps.get(String(id));
    if (!routine || routine.agentId !== agentId) {
      throw new Error(`Routine ${String(id)} was not found`);
    }
    return routine;
  }

  async function changeable(caller: AgentToolCallerContext, id: unknown) {
    const routine = await owned(caller, id);
    if (routine.access === "full") {
      throw new Error(
        "Only the user can change or run a routine with full access",
      );
    }
    return routine;
  }

  const idSchema = {
    type: "object",
    properties: { id: { type: "string", description: "Routine id" } },
    required: ["id"],
    additionalProperties: false,
  };

  registry.register({
    descriptor: {
      group: "routine",
      name: "list",
      description:
        "List your scheduled routines: what each asks you to do, when it runs next, and whether it is paused.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller) => deps.list(await persona(caller)),
  });

  registry.register({
    descriptor: {
      group: "routine",
      name: "create",
      description:
        "Schedule a routine for yourself when the user asks you to do something regularly (a morning brief, a weekly review, a reminder). Each run happens in its own thread with your memory; confirm the schedule with the user in plain words afterwards.",
      inputSchema: {
        type: "object",
        properties: editableProperties,
        required: ["name", "prompt", "schedule"],
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) => {
      const schedule = parseSchedule(input.schedule);
      if (!schedule) throw new Error("schedule is required");
      return deps.create({
        agentId: await persona(caller),
        name: String(input.name),
        prompt: String(input.prompt),
        schedule,
        timeZone: optionalText(input.timeZone),
        access: oneOf(AGENT_ACCESS, input.access),
        deliver: oneOf(DELIVER, input.deliver),
      });
    },
  });

  registry.register({
    descriptor: {
      group: "routine",
      name: "update",
      description:
        "Change one of your routines, or pause and resume it. Only the fields you pass change.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Routine id" },
          ...editableProperties,
          paused: {
            type: "boolean",
            description: "true pauses, false resumes",
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) => {
      const routine = await changeable(caller, input.id);
      return deps.update({
        id: routine.id,
        name: optionalText(input.name),
        prompt: optionalText(input.prompt),
        schedule: parseSchedule(input.schedule),
        timeZone: optionalText(input.timeZone),
        access: oneOf(AGENT_ACCESS, input.access),
        deliver: oneOf(DELIVER, input.deliver),
        paused: typeof input.paused === "boolean" ? input.paused : undefined,
      });
    },
  });

  registry.register({
    descriptor: {
      group: "routine",
      name: "delete",
      description:
        "Delete one of your routines when the user no longer wants it.",
      inputSchema: idSchema,
    },
    isAvailable: isPersonal,
    execute: async (caller, input) => {
      const routine = await owned(caller, input.id);
      deps.delete(routine.id);
      return { deleted: routine.id };
    },
  });

  registry.register({
    descriptor: {
      group: "routine",
      name: "run",
      description:
        "Start one of your routines now, for example to try it after creating it. Returns at once; read the result later with routine_runs.",
      inputSchema: idSchema,
    },
    isAvailable: isPersonal,
    execute: async (caller, input) =>
      deps.run((await changeable(caller, input.id)).id),
  });

  registry.register({
    descriptor: {
      group: "routine",
      name: "runs",
      description:
        "Read the recent runs of one of your routines with their status, summary, and error, newest first.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Routine id" },
          limit: { type: "integer", description: "1-50 (default 10)" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) => {
      const routine = await owned(caller, input.id);
      const limit = typeof input.limit === "number" ? input.limit : 10;
      return deps.runs(routine.id, Math.min(50, Math.max(1, limit)));
    },
  });
}
