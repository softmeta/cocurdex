import {
  type AgentToolCallerContext,
  type CreateFollowUpPayload,
  FOLLOW_UP_NOTE_MAX_LENGTH,
  type FollowUpRecord,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export interface FollowUpToolDependencies {
  personaOf(sessionId: string): Promise<string | null>;
  list(agentId: string): FollowUpRecord[];
  get(id: string): FollowUpRecord | null;
  create(payload: CreateFollowUpPayload): FollowUpRecord;
  cancel(id: string): FollowUpRecord;
  now?: () => Date;
}

const MAX_IN_MINUTES = 366 * 24 * 60;

export function followUpDueAt(
  input: { at?: unknown; inMinutes?: unknown },
  now: Date,
) {
  const hasAt = typeof input.at === "string" && input.at.trim() !== "";
  const hasIn = typeof input.inMinutes === "number";
  if (hasAt === hasIn) {
    throw new Error("Pass exactly one of at or inMinutes.");
  }
  if (hasAt) {
    const at = String(input.at).trim();
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(at)) {
      throw new Error(
        "at needs a UTC offset, for example 2026-11-16T09:00:00+08:00.",
      );
    }
    return at;
  }
  const minutes = Number(input.inMinutes);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_IN_MINUTES) {
    throw new Error(`inMinutes must be between 1 and ${MAX_IN_MINUTES}.`);
  }
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function registerFollowUpTools(
  registry: AgentToolRegistry,
  deps: FollowUpToolDependencies,
) {
  const isPersonal = (caller: AgentToolCallerContext) =>
    caller.sessionKind === "personal";

  async function persona(caller: AgentToolCallerContext) {
    const agentId = await deps.personaOf(caller.sessionId);
    if (!agentId) {
      throw new Error("Follow-ups are only available to personal assistants");
    }
    return agentId;
  }

  registry.register({
    descriptor: {
      group: "follow_up",
      name: "set",
      deferred: true,
      description:
        "Wake yourself up once, later, in this same conversation: to check on something, remind the user, or continue a task that has to wait. At the due time your note arrives here as a message and you take a turn with this conversation's context. Use a routine instead for anything that repeats.",
      inputSchema: {
        type: "object",
        properties: {
          note: {
            type: "string",
            description: `What to do when it fires, written to yourself; at most ${FOLLOW_UP_NOTE_MAX_LENGTH} characters`,
          },
          at: {
            type: "string",
            description:
              "When, as an ISO 8601 time with a UTC offset, such as 2026-11-16T09:00:00+08:00",
          },
          inMinutes: {
            type: "integer",
            description: "When, as minutes from now; pass this or at",
          },
        },
        required: ["note"],
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) =>
      deps.create({
        agentId: await persona(caller),
        note: String(input.note),
        dueAt: followUpDueAt(input, deps.now?.() ?? new Date()),
      }),
  });

  registry.register({
    descriptor: {
      group: "follow_up",
      name: "list",
      deferred: true,
      readOnly: true,
      description:
        "List your follow-ups that have not fired yet, soonest first.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller) =>
      deps
        .list(await persona(caller))
        .filter((followUp) => followUp.status === "pending"),
  });

  registry.register({
    descriptor: {
      group: "follow_up",
      name: "cancel",
      deferred: true,
      description:
        "Cancel one of your follow-ups that has not fired yet, for example when the thing it was waiting for already happened.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Follow-up id" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) => {
      const agentId = await persona(caller);
      const followUp = deps.get(String(input.id));
      if (!followUp || followUp.agentId !== agentId) {
        throw new Error(`Follow-up ${String(input.id)} was not found`);
      }
      return deps.cancel(followUp.id);
    },
  });
}
