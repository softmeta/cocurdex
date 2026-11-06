import type {
  AgentToolCallerContext,
  DelegatedWorkRecord,
  DelegationCatalog,
  SendDelegatedWorkPayload,
  StartDelegatedWorkPayload,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export interface WorkToolDependencies {
  personaOf(sessionId: string): Promise<string | null>;
  catalog(): Promise<DelegationCatalog>;
  start(payload: StartDelegatedWorkPayload): Promise<DelegatedWorkRecord>;
  list(personaId: string): Promise<DelegatedWorkRecord[]>;
  send(payload: SendDelegatedWorkPayload): Promise<DelegatedWorkRecord>;
  stop(target: {
    personaId: string;
    sessionId: string;
  }): Promise<DelegatedWorkRecord>;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const SESSION_ID = {
  type: "string",
  description: "The sessionId returned by work_start or work_list",
};

export function registerWorkTools(
  registry: AgentToolRegistry,
  deps: WorkToolDependencies,
) {
  const isPersonal = (caller: AgentToolCallerContext) =>
    caller.sessionKind === "personal";

  async function persona(caller: AgentToolCallerContext) {
    const personaId = await deps.personaOf(caller.sessionId);
    if (!personaId) {
      throw new Error(
        "Delegating work is only available to personal assistants",
      );
    }
    return personaId;
  }

  registry.register({
    descriptor: {
      group: "work",
      name: "catalog",
      description:
        "List what you can delegate coding work to: the user's workspaces (code repositories), their saved agent roles, and their team templates. Read it before work_start when you do not know the ids.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller) => {
      await persona(caller);
      return deps.catalog();
    },
  });

  registry.register({
    descriptor: {
      group: "work",
      name: "start",
      description:
        "Delegate coding or other repository work to a work session in one of the user's workspaces. It runs on the user's coding agents (Claude Code, Codex, and others) with the workspace's usual agent and model unless you pick an agent role, or as a team when you pick a team template. The session appears in the user's work sidebar, where they can follow and take it over. Each time it finishes a turn, its reply is reported back to you in this thread. Ask the user which workspace when it is unclear. Write the prompt as a complete task: goal, context the user gave you, and what done looks like.",
      inputSchema: {
        type: "object",
        properties: {
          workspace: {
            type: "string",
            description: "Workspace id or exact name from work_catalog",
          },
          prompt: { type: "string", description: "The full task" },
          title: {
            type: "string",
            description: "Short session title in the user's language",
          },
          agentRole: {
            type: "string",
            description: "Agent role id or name from work_catalog",
          },
          teamTemplate: {
            type: "string",
            description:
              "Team template id or name from work_catalog; the session leads that team",
          },
          isolateWorktree: {
            type: "boolean",
            description:
              "Work in a new git worktree so the user's checkout stays untouched",
          },
        },
        required: ["workspace", "prompt"],
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) =>
      deps.start({
        personaId: await persona(caller),
        workspace: String(input.workspace),
        prompt: String(input.prompt),
        title: optionalText(input.title),
        agentRole: optionalText(input.agentRole),
        teamTemplate: optionalText(input.teamTemplate),
        isolateWorktree: input.isolateWorktree === true,
      }),
  });

  registry.register({
    descriptor: {
      group: "work",
      name: "list",
      description:
        "List the work sessions you delegated, newest first, with their state (running, completed, failed, cancelled, interrupted, idle, archived).",
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
      group: "work",
      name: "send",
      description:
        "Send a follow-up instruction to a work session you delegated, for example the user's answer or a correction. A running session receives it in its current turn when it can, otherwise after it.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: SESSION_ID,
          message: { type: "string", description: "The instruction" },
        },
        required: ["sessionId", "message"],
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) =>
      deps.send({
        personaId: await persona(caller),
        sessionId: String(input.sessionId),
        message: String(input.message),
      }),
  });

  registry.register({
    descriptor: {
      group: "work",
      name: "stop",
      description:
        "Stop the current turn of a work session you delegated. Only do this when the user asks.",
      inputSchema: {
        type: "object",
        properties: { sessionId: SESSION_ID },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) =>
      deps.stop({
        personaId: await persona(caller),
        sessionId: String(input.sessionId),
      }),
  });
}
