import type { AgentRoleAvatar } from "./agent-role";
import type { AgentId, SessionStatus } from "./contracts";

export type TeamStatus = "active" | "stopped";
export type TeamMemberStatus =
  | "spawning"
  | "running"
  | "idle"
  | "error"
  | "stopped";

export interface TeamRosterMember {
  name: string;
  agentRoleId: string;
  prompt: string;
}

export interface TeamRoster {
  templateId: string;
  name: string;
  description: string | null;
  leadPrompt: string;
  members: TeamRosterMember[];
}

export interface TeamRecord {
  id: string;
  leadSessionId: string;
  workspaceId: string;
  status: TeamStatus;
  roster: TeamRoster | null;
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

export interface TeamTaskRecord {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  status: TeamTaskStatus;
  assigneeSessionId: string | null;
  blockedBy: string[];
  evidence: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamSnapshot {
  team: TeamRecord;
  members: TeamMemberRecord[];
}

export interface SpawnTeammatePayload {
  name: string;
  title?: string;
  prompt: string;
  agentRoleId?: string | null;
  agentType?: AgentId;
  isolateWorktree?: boolean;
}

export interface TeamTemplateMember {
  agentRoleId: string;
  prompt: string;
}

export interface TeamTemplateRecord {
  id: string;
  name: string;
  description: string | null;
  avatar: AgentRoleAvatar | null;
  members: TeamTemplateMember[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveTeamTemplatePayload {
  id?: string;
  name: string;
  description?: string | null;
  avatar?: AgentRoleAvatar | null;
  members: TeamTemplateMember[];
}

export interface SpawnTeamTemplatePayload {
  templateId: string;
  prompt?: string;
}

export interface CreateTeamPayload {
  leadSessionId: string;
  templateId: string;
}

export const TEAM_TEMPLATES_SETTING_KEY = "teamTemplates";

export interface TeamChangedEvent {
  type: "team.changed";
  teamId: string;
  leadSessionId: string;
}

export const TEAM_MAX_MEMBERS = 8;
export const TEAM_MIN_MEMBERS = 2;
export const TEAM_TEMPLATE_DESCRIPTION_MAX_LENGTH = 500;

const TEAM_UNSUPPORTED_AGENTS: ReadonlySet<AgentId> = new Set(["opencode"]);

export function supportsAgentTeam(agentId: AgentId) {
  return !TEAM_UNSUPPORTED_AGENTS.has(agentId);
}

export function normalizeTeamTemplateMembers(
  value: unknown,
): TeamTemplateMember[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const member = item as Record<string, unknown>;
    const agentRoleId =
      typeof member.agentRoleId === "string" ? member.agentRoleId : "";
    if (!agentRoleId || seen.has(agentRoleId)) return [];
    seen.add(agentRoleId);
    const prompt = typeof member.prompt === "string" ? member.prompt : "";
    return [{ agentRoleId, prompt }];
  });
}

export function buildTeamRosterMembers(
  members: readonly TeamTemplateMember[],
  roles: ReadonlyMap<string, { name: string }>,
): TeamRosterMember[] | null {
  const taken = new Set<string>();
  const rosterMembers: TeamRosterMember[] = [];
  for (const member of members) {
    const role = roles.get(member.agentRoleId);
    if (!role) return null;
    const base = role.name.trim();
    let name = base;
    for (let suffix = 2; taken.has(name); suffix += 1) {
      name = `${base} ${suffix}`;
    }
    taken.add(name);
    rosterMembers.push({ ...member, name });
  }
  return rosterMembers;
}

export const TEAM_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const TEAM_TASK_STATUSES = [
  "backlog",
  "doing",
  "review",
  "done",
] as const;
export type TeamTaskStatus = (typeof TEAM_TASK_STATUSES)[number];

export type TeamTaskRejection =
  | "TASK_BLOCKED"
  | "EVIDENCE_REQUIRED"
  | "REVIEW_REQUIRED"
  | "SELF_APPROVAL";

export function checkTeamTaskUpdate(input: {
  task: { status: string; assigneeSessionId: string | null };
  blockers: { status: string }[];
  callerSessionId: string;
  update: {
    status?: TeamTaskStatus;
    assignee?: "me" | null;
    evidence?: string;
  };
}): { ok: true } | { ok: false; reason: TeamTaskRejection } {
  const { task, update } = input;
  const starting = update.assignee === "me" || update.status === "doing";
  if (starting && input.blockers.some((blocker) => blocker.status !== "done"))
    return { ok: false, reason: "TASK_BLOCKED" };
  if (update.status === "review" && !update.evidence?.trim())
    return { ok: false, reason: "EVIDENCE_REQUIRED" };
  if (update.status === "done" && task.status !== "review")
    return { ok: false, reason: "REVIEW_REQUIRED" };
  if (
    update.status === "done" &&
    task.assigneeSessionId === input.callerSessionId
  )
    return { ok: false, reason: "SELF_APPROVAL" };
  return { ok: true };
}

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
  | "invalid_name"
  | "not_in_roster"
  | "roster_fixes_agent";

export function canSpawnTeammate(
  team: (Pick<TeamRecord, "status"> & { roster?: TeamRoster | null }) | null,
  members: Pick<TeamMemberRecord, "name">[],
  payload: Pick<SpawnTeammatePayload, "name" | "agentRoleId" | "agentType">,
): { ok: true } | { ok: false; reason: SpawnTeammateRejection } {
  if (team?.status === "stopped") return { ok: false, reason: "team_stopped" };
  if (team?.roster) {
    if (!findRosterMember(team.roster, payload.name))
      return { ok: false, reason: "not_in_roster" };
    if (payload.agentRoleId || payload.agentType)
      return { ok: false, reason: "roster_fixes_agent" };
  } else if (!TEAM_NAME_PATTERN.test(payload.name)) {
    return { ok: false, reason: "invalid_name" };
  }
  if (members.length >= TEAM_MAX_MEMBERS)
    return { ok: false, reason: "member_limit" };
  if (members.some((member) => member.name === payload.name))
    return { ok: false, reason: "duplicate_name" };
  return { ok: true };
}

export function findRosterMember(roster: TeamRoster, name: string) {
  return roster.members.find((member) => member.name === name) ?? null;
}

export function renderTeamRosterInstructions(roster: TeamRoster) {
  const members = roster.members.map((member) => {
    const prompt = member.prompt.trim().replace(/\s+/g, " ");
    return prompt ? `- ${member.name}: ${prompt}` : `- ${member.name}`;
  });
  return [
    `Your team is "${roster.name}". You are its coordinator: plan first, then delegate.`,
    ...(roster.description ? [roster.description] : []),
    ...(roster.leadPrompt.trim()
      ? [`Your own focus: ${roster.leadPrompt.trim()}`]
      : []),
    "Roster (only these teammates can be spawned):",
    ...members,
    "Split the user's request into tasks with team_task_create (use blockedBy for ordering) before spawning anyone. Then spawn only the roster members the plan needs with team_spawn_teammate, using the roster name and a prompt that assigns their task ids. Their role and standing instructions are applied automatically; do not pass agentRoleId or agentType. Call team_roster to re-read the roster.",
  ].join("\n");
}

export function renderTeammateBriefing(input: {
  name: string;
  leadSessionId: string;
  prompt: string;
}) {
  return [
    `You are teammate "${input.name}" in a Cocurdex agent team led by session ${input.leadSessionId}.`,
    'Use team_task_list, team_task_create, and team_task_update to coordinate on the shared task list; claim a task with team_task_update({ taskId, status: "doing", assignee: "me" }). Blocked tasks wait for their prerequisites. When you finish, move the task to "review" with evidence (commands run and results); you cannot mark your own task done.',
    "Use messaging_send_message to talk to the lead or other teammates. Your final reply for each turn is delivered to the lead automatically.",
    "Every message starts a new turn for its receiver, so never reply to acknowledgements or send thanks; message only when you have new information or a request.",
    "",
    input.prompt,
  ].join("\n");
}

export type TeammateReportOutcome = "finished" | "failed" | "waiting";

const TEAMMATE_REPORT_HEADERS: Record<TeammateReportOutcome, string> = {
  finished: "finished",
  failed: "failed",
  waiting: "is waiting for the user",
};

export function renderTeammateReport(
  input: { name: string; outcome: TeammateReportOutcome },
  content: string,
) {
  const header = `[Teammate "${input.name}" ${TEAMMATE_REPORT_HEADERS[input.outcome]}]`;
  return `${header}\n${content}`;
}
