import type { AgentId, SessionStatus } from "./contracts";

export type TeamStatus = "active" | "stopped";
export type TeamMemberStatus =
  | "spawning"
  | "running"
  | "idle"
  | "error"
  | "stopped";

export interface TeamRecord {
  id: string;
  leadSessionId: string;
  workspaceId: string;
  issueViewId: string;
  status: TeamStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberRecord {
  teamId: string;
  sessionId: string;
  name: string;
  agentRoleId: string | null;
  status: TeamMemberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TeamSnapshot {
  team: TeamRecord;
  members: TeamMemberRecord[];
}

export interface SpawnTeammatePayload {
  name: string;
  prompt: string;
  agentRoleId?: string | null;
  agentType?: AgentId;
  isolateWorktree?: boolean;
}

export interface TeamChangedEvent {
  type: "team.changed";
  teamId: string;
  leadSessionId: string;
}

export const TEAM_MAX_MEMBERS = 8;
export const TEAM_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const TEAM_TASK_STATUSES = [
  "backlog",
  "doing",
  "review",
  "done",
] as const;
export type TeamTaskStatus = (typeof TEAM_TASK_STATUSES)[number];

export type TeamMemberEvent =
  | { type: "turn.started" }
  | { type: "turn.completed" }
  | { type: "turn.failed" }
  | { type: "stopped" };

const memberStatusByEvent: Record<TeamMemberEvent["type"], TeamMemberStatus> = {
  "turn.started": "running",
  "turn.completed": "idle",
  "turn.failed": "error",
  stopped: "stopped",
};

export function transitionTeamMember(
  member: TeamMemberRecord,
  event: TeamMemberEvent,
  now: string,
): TeamMemberRecord {
  if (member.status === "stopped") return member;
  const status = memberStatusByEvent[event.type];
  if (status === member.status) return member;
  return { ...member, status, updatedAt: now };
}

export function teamMemberEventFromSessionStatus(
  status: SessionStatus,
): TeamMemberEvent | null {
  if (status === "running") return { type: "turn.started" };
  if (status === "error") return { type: "turn.failed" };
  return null;
}

export type SpawnTeammateRejection =
  | "team_stopped"
  | "member_limit"
  | "duplicate_name"
  | "invalid_name";

export function canSpawnTeammate(
  team: Pick<TeamRecord, "status"> | null,
  members: Pick<TeamMemberRecord, "name">[],
  payload: Pick<SpawnTeammatePayload, "name">,
): { ok: true } | { ok: false; reason: SpawnTeammateRejection } {
  if (team?.status === "stopped") return { ok: false, reason: "team_stopped" };
  if (!TEAM_NAME_PATTERN.test(payload.name))
    return { ok: false, reason: "invalid_name" };
  if (members.length >= TEAM_MAX_MEMBERS)
    return { ok: false, reason: "member_limit" };
  if (members.some((member) => member.name === payload.name))
    return { ok: false, reason: "duplicate_name" };
  return { ok: true };
}

export function renderTeammateBriefing(input: {
  name: string;
  leadSessionId: string;
  prompt: string;
}) {
  return [
    `You are teammate "${input.name}" in a Cocurdex agent team led by session ${input.leadSessionId}.`,
    'Use team_task_list, team_task_create, and team_task_update to coordinate on the shared task list; claim a task with team_task_update({ issueId, status: "doing", assignee: "me" }).',
    "Use messaging_send_message to talk to the lead or other teammates. Your final reply for each turn is delivered to the lead automatically.",
    "",
    input.prompt,
  ].join("\n");
}

export function renderTeammateReport(
  input: { name: string; outcome: "finished" | "failed" },
  content: string,
) {
  const header =
    input.outcome === "finished"
      ? `[Teammate "${input.name}" finished]`
      : `[Teammate "${input.name}" failed]`;
  return `${header}\n${content}`;
}
