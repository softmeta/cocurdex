import type {
  AgentToolCallerContext,
  DelegatedWorkRecord,
  DelegationCatalog,
  DelegationCatalogQuery,
  RoutineReport,
  SendDelegatedWorkPayload,
  StartDelegatedWorkPayload,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";
import { parseReport, reportStatusSchema } from "./report-input";

export interface WorkToolDependencies {
  personaOf(sessionId: string): Promise<string | null>;
  catalog(query: DelegationCatalogQuery): Promise<DelegationCatalog>;
  start(payload: StartDelegatedWorkPayload): Promise<DelegatedWorkRecord>;
  list(personaId: string): Promise<DelegatedWorkRecord[]>;
  send(payload: SendDelegatedWorkPayload): Promise<DelegatedWorkRecord>;
  stop(target: {
    personaId: string;
    sessionId: string;
  }): Promise<DelegatedWorkRecord>;
  reporting(sessionId: string): boolean;
  report(sessionId: string, report: RoutineReport): void;
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
        "List what you can delegate coding work to: the user's workspaces (code repositories), their saved agent roles, their team templates, and the other computers paired with this one (hosts). Pass host to list the workspaces and agent roles on that computer instead. Read it before work_start when you do not know the ids.",
      inputSchema: {
        type: "object",
        properties: {
          host: {
            type: "string",
            description:
              "Id or name of a paired computer from hosts; omit for this computer",
          },
        },
        additionalProperties: false,
      },
    },
    isAvailable: isPersonal,
    execute: async (caller, input) => {
      await persona(caller);
      return deps.catalog({ host: optionalText(input.host) });
    },
  });

  registry.register({
    descriptor: {
      group: "work",
      name: "start",
      description:
        "Delegate coding or other repository work to a work session in one of the user's workspaces. It runs on the user's coding agents (Claude Code, Codex, and others) with the workspace's usual agent and model unless you pick an agent role, or as a team when you pick a team template. The session appears in the user's work sidebar, where they can follow and take it over. Each time it finishes a turn with something for the user, its report comes back to you in this thread; turns with nothing to tell do not. Ask the user which workspace when it is unclear. Write the prompt as a complete task: goal, context the user gave you, and what done looks like.",
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
          issue: {
            type: "string",
            description:
              "Issue the work is for (identifier like COC-12, or id). Pass it when the request concerns an issue or the user wants the work tracked: the session is linked to it, the issue moves to a started status, and each report is added to it as a comment.",
          },
          isolateWorktree: {
            type: "boolean",
            description:
              "Work in a new git worktree so the user's checkout stays untouched",
          },
          host: {
            type: "string",
            description:
              "Id or name of a paired computer to run the work on; workspace and agentRole then come from work_catalog with that host. Team templates are not available there.",
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
        host: optionalText(input.host),
        issue: optionalText(input.issue),
      }),
  });

  registry.register({
    descriptor: {
      group: "work",
      name: "list",
      description:
        "List the work sessions you delegated, newest first, with their state (running, completed, failed, cancelled, interrupted, idle, archived), what each waits for (permission, question, plan) when the user must answer in it, and the paired computer (host) it runs on, if any.",
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

  registry.register({
    descriptor: {
      group: "work",
      name: "report",
      description:
        "Report the turn you are ending to the personal assistant that delegated this work. Call it once, at the end of each turn. dropped tells the assistant nothing; any other status reaches it with your summary.",
      inputSchema: {
        type: "object",
        properties: {
          status: reportStatusSchema,
          summary: {
            type: "string",
            description:
              "For the assistant: the outcome, what the user must review or decide, and what you did not verify",
          },
          question: {
            type: "string",
            description: "Required with needs_you: what the user has to answer",
          },
        },
        required: ["status", "summary"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => deps.reporting(caller.sessionId),
    execute: async (caller, input) => {
      const report = parseReport(input);
      deps.report(caller.sessionId, report);
      return { recorded: report.status };
    },
  });
}
