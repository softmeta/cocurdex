import {
  type SpawnTeammatePayload,
  type SpawnTeamTemplatePayload,
  TEAM_TASK_STATUSES,
  type TeamMemberRecord,
  type TeamTemplateRecord,
} from "@cocurdex/shared";
import type {
  TeamRoleSummary,
  TeamTaskSummary,
  TeamTaskUpdateInput,
} from "../../team/team-module";
import type { AgentToolRegistry } from "../tool-registry";

export interface TeamToolDependencies {
  spawn(
    leadSessionId: string,
    payload: SpawnTeammatePayload,
  ): Promise<TeamMemberRecord>;
  spawnTemplate(
    leadSessionId: string,
    payload: SpawnTeamTemplatePayload,
  ): Promise<TeamMemberRecord[]>;
  listRoles(): Promise<TeamRoleSummary[]>;
  listTemplates(): Promise<TeamTemplateRecord[]>;
  taskCreate(
    sessionId: string,
    input: { title: string; description?: string },
  ): Promise<TeamTaskSummary>;
  taskList(sessionId: string): Promise<TeamTaskSummary[]>;
  taskUpdate(
    sessionId: string,
    input: TeamTaskUpdateInput,
  ): Promise<TeamTaskSummary>;
}

export function registerTeamTools(
  registry: AgentToolRegistry,
  deps: TeamToolDependencies,
) {
  registry.register({
    descriptor: {
      group: "team",
      name: "spawn_teammate",
      description:
        "Spawn a teammate agent session that works alongside you. It shares your task list, can message you, and its final reply for each turn is delivered back to you. Names are lowercase slugs (a-z, 0-9, dashes).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Unique teammate name" },
          prompt: { type: "string", description: "Initial instructions" },
          agentRoleId: { type: "string", description: "Saved agent role id" },
          agentType: {
            type: "string",
            description: "Agent provider id; defaults to yours",
          },
          isolateWorktree: {
            type: "boolean",
            description: "Run the teammate in its own git worktree",
          },
        },
        required: ["name", "prompt"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => caller.sessionKind === "main",
    execute: (caller, input) =>
      deps.spawn(caller.sessionId, {
        name: String(input.name),
        prompt: String(input.prompt),
        agentRoleId:
          typeof input.agentRoleId === "string" ? input.agentRoleId : null,
        ...(typeof input.agentType === "string"
          ? { agentType: input.agentType as SpawnTeammatePayload["agentType"] }
          : {}),
        isolateWorktree: input.isolateWorktree === true,
      }),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "list_roles",
      description:
        "List saved agent roles (id, name, agent type, model, permission mode) you can pass as agentRoleId when spawning a teammate.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => caller.sessionKind === "main",
    execute: () => deps.listRoles(),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "list_templates",
      description:
        "List user-defined team templates. Each template names its teammates, their roles, and their standing instructions.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => caller.sessionKind === "main",
    execute: () => deps.listTemplates(),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "spawn_template",
      description:
        "Spawn every teammate defined by a team template. The optional prompt is appended to each teammate's standing instructions.",
      inputSchema: {
        type: "object",
        properties: {
          templateId: { type: "string" },
          prompt: { type: "string", description: "Task for the whole team" },
        },
        required: ["templateId"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => caller.sessionKind === "main",
    execute: (caller, input) =>
      deps.spawnTemplate(caller.sessionId, {
        templateId: String(input.templateId),
        ...(typeof input.prompt === "string" ? { prompt: input.prompt } : {}),
      }),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "task_create",
      description: "Create a task on the team's shared task list.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => caller.teamId !== null,
    execute: (caller, input) =>
      deps.taskCreate(caller.sessionId, {
        title: String(input.title),
        ...(typeof input.description === "string"
          ? { description: input.description }
          : {}),
      }),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "task_list",
      description:
        "List the team's shared tasks with status and assignee session id.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => caller.teamId !== null,
    execute: (caller) => deps.taskList(caller.sessionId),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "task_update",
      description:
        'Update a shared task. Claim it with assignee "me" and status "doing"; only one session can hold a task.',
      inputSchema: {
        type: "object",
        properties: {
          issueId: { type: "string" },
          status: { type: "string", enum: [...TEAM_TASK_STATUSES] },
          assignee: { type: ["string", "null"], enum: ["me", null] },
        },
        required: ["issueId"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => caller.teamId !== null,
    execute: (caller, input) =>
      deps.taskUpdate(caller.sessionId, {
        issueId: String(input.issueId),
        ...(typeof input.status === "string"
          ? { status: input.status as TeamTaskUpdateInput["status"] }
          : {}),
        ...(input.assignee === "me" || input.assignee === null
          ? { assignee: input.assignee }
          : {}),
      }),
  });
}
