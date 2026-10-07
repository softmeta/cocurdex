import {
  type AgentToolCallerContext,
  type SpawnTeammatePayload,
  type SpawnTeamTemplatePayload,
  TEAM_TASK_STATUSES,
  type TeamMemberRecord,
  type TeamRecord,
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
  stopLeadMember(
    leadSessionId: string,
    sessionId: string,
    options: { force: boolean },
  ): Promise<TeamMemberRecord>;
  stopLeadTeam(
    leadSessionId: string,
    options: { force: boolean },
  ): Promise<TeamRecord>;
}

function isLead(caller: AgentToolCallerContext) {
  return caller.sessionKind === "main";
}

function isTeamParticipant(caller: AgentToolCallerContext) {
  return caller.sessionKind === "main" || caller.sessionKind === "teammate";
}

const FORCE_STOP_PROPERTY = {
  type: "boolean",
  description: "Interrupt busy teammates and discard their unread messages",
};

export function registerTeamTools(
  registry: AgentToolRegistry,
  deps: TeamToolDependencies,
) {
  registry.register({
    descriptor: {
      group: "team",
      name: "spawn_teammate",
      description:
        "Spawn a teammate agent session that works alongside you. It shares your task list, can message you, and its final reply for each turn is delivered back to you: injected into your current turn when your agent supports steering, otherwise as a new turn after yours ends. To wait for teammates, end your turn; their reports wake you. Do not poll or stop teammates to finish early. Names are lowercase slugs (a-z, 0-9, dashes) used to address the teammate; title is the human-readable label shown to the user, written in the user's language.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Unique teammate name" },
          title: {
            type: "string",
            description: "Short display title; defaults to name",
          },
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
    isAvailable: isLead,
    execute: (caller, input) =>
      deps.spawn(caller.sessionId, {
        name: String(input.name),
        ...(typeof input.title === "string" ? { title: input.title } : {}),
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
        "List saved agent roles (id, name, description of what the role is good at, agent type, model, permission mode) you can pass as agentRoleId when spawning a teammate.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: isLead,
    execute: () => deps.listRoles(),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "list_templates",
      description:
        "List user-defined team templates. Each template has a description of what the team is for and names its teammates, their roles, and their standing instructions.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: isLead,
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
    isAvailable: isLead,
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
      description:
        "Create a task on the team's shared task list. A lead may create tasks before spawning teammates. List prerequisite task ids in blockedBy to enforce ordering: nobody can start this task until every prerequisite is done.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          blockedBy: {
            type: "array",
            items: { type: "string" },
            description: "Ids of existing tasks that must be done first",
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
    isAvailable: isTeamParticipant,
    execute: (caller, input) =>
      deps.taskCreate(caller.sessionId, {
        title: String(input.title),
        ...(typeof input.description === "string"
          ? { description: input.description }
          : {}),
        ...(Array.isArray(input.blockedBy)
          ? { blockedBy: input.blockedBy.map(String) }
          : {}),
      }),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "task_list",
      description:
        "List the team's shared tasks with status, assignee session id, prerequisites (blockedBy, blocked), and review evidence.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: isTeamParticipant,
    execute: (caller) => deps.taskList(caller.sessionId),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "task_update",
      description:
        'Update a shared task. Claim it with assignee "me" and status "doing"; only one session can hold a task, and blocked tasks cannot be started. When finished, move it to "review" with evidence: the commands you ran and their results, or the files to inspect. Only a different session, usually the lead or a reviewer, may move a reviewed task to "done".',
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          status: { type: "string", enum: [...TEAM_TASK_STATUSES] },
          assignee: { type: ["string", "null"], enum: ["me", null] },
          evidence: {
            type: "string",
            description: "Required when moving to review",
          },
        },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
    isAvailable: isTeamParticipant,
    execute: (caller, input) =>
      deps.taskUpdate(caller.sessionId, {
        taskId: String(input.taskId),
        ...(typeof input.status === "string"
          ? { status: input.status as TeamTaskUpdateInput["status"] }
          : {}),
        ...(input.assignee === "me" || input.assignee === null
          ? { assignee: input.assignee }
          : {}),
        ...(typeof input.evidence === "string"
          ? { evidence: input.evidence }
          : {}),
      }),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "stop_member",
      description:
        "Stop one teammate session after it has reported and is idle. Fails with members_busy while it is running or has unread messages; then end your turn and wait for its report. Pass force: true only when it is off track and must be interrupted.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Teammate session id" },
          force: FORCE_STOP_PROPERTY,
        },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
    isAvailable: isLead,
    execute: (caller, input) =>
      deps.stopLeadMember(caller.sessionId, String(input.sessionId), {
        force: input.force === true,
      }),
  });
  registry.register({
    descriptor: {
      group: "team",
      name: "stop",
      description:
        "Stop every teammate and end the team once every report is merged. Fails with members_busy while any teammate is running or has unread messages; then end your turn and wait for their reports. Pass force: true only to abandon unfinished work.",
      inputSchema: {
        type: "object",
        properties: { force: FORCE_STOP_PROPERTY },
        additionalProperties: false,
      },
    },
    isAvailable: isLead,
    execute: (caller, input) =>
      deps.stopLeadTeam(caller.sessionId, { force: input.force === true }),
  });
}
