import type { DatabaseSync } from "node:sqlite";
import type {
  TeamMemberRecord,
  TeamMemberStatus,
  TeamRecord,
  TeamRoster,
  TeamSnapshot,
  TeamStatus,
  TeamTaskRecord,
  TeamTaskStatus,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import type { TeamRepository } from "./team-repository";

interface TeamRow extends SqliteRow {
  id: string;
  lead_session_id: string;
  workspace_id: string;
  status: TeamStatus;
  roster_json: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamMemberRow extends SqliteRow {
  team_id: string;
  session_id: string;
  name: string;
  agent_role_id: string | null;
  status: TeamMemberStatus;
  created_at: string;
  updated_at: string;
}

interface TeamTaskRow extends SqliteRow {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  status: TeamTaskStatus;
  assignee_session_id: string | null;
  blocked_by_json: string;
  evidence: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

function parseBlockedBy(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function mapTask(row: TeamTaskRow): TeamTaskRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    description: row.description,
    status: row.status,
    assigneeSessionId: row.assignee_session_id,
    blockedBy: parseBlockedBy(row.blocked_by_json),
    evidence: row.evidence,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseRoster(value: string | null): TeamRoster | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<TeamRoster> | null;
    if (!parsed || !Array.isArray(parsed.members)) return null;
    return {
      templateId: String(parsed.templateId ?? ""),
      name: String(parsed.name ?? ""),
      description:
        typeof parsed.description === "string" ? parsed.description : null,
      leadPrompt:
        typeof parsed.leadPrompt === "string" ? parsed.leadPrompt : "",
      members: parsed.members.flatMap((member) =>
        member &&
        typeof member.name === "string" &&
        typeof member.agentRoleId === "string"
          ? [
              {
                name: member.name,
                agentRoleId: member.agentRoleId,
                prompt: typeof member.prompt === "string" ? member.prompt : "",
              },
            ]
          : [],
      ),
    };
  } catch {
    return null;
  }
}

function mapTeam(row: TeamRow): TeamRecord {
  return {
    id: row.id,
    leadSessionId: row.lead_session_id,
    workspaceId: row.workspace_id,
    status: row.status,
    roster: parseRoster(row.roster_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(row: TeamMemberRow): TeamMemberRecord {
  return {
    teamId: row.team_id,
    sessionId: row.session_id,
    name: row.name,
    agentRoleId: row.agent_role_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteTeamRepository(
  database: DatabaseSync,
): TeamRepository {
  function snapshot(row: TeamRow | undefined): TeamSnapshot | null {
    if (!row) return null;
    const members = database
      .prepare(
        "SELECT * FROM team_members WHERE team_id = ? ORDER BY created_at, session_id",
      )
      .all(row.id) as TeamMemberRow[];
    return { team: mapTeam(row), members: members.map(mapMember) };
  }

  return {
    async getById(teamId) {
      return snapshot(
        database.prepare("SELECT * FROM teams WHERE id = ?").get(teamId) as
          | TeamRow
          | undefined,
      );
    },
    async getByLead(leadSessionId) {
      return snapshot(
        database
          .prepare("SELECT * FROM teams WHERE lead_session_id = ?")
          .get(leadSessionId) as TeamRow | undefined,
      );
    },
    async findBySession(sessionId) {
      return snapshot(
        database
          .prepare(
            `SELECT teams.* FROM teams
             LEFT JOIN team_members ON team_members.team_id = teams.id
             WHERE teams.lead_session_id = ? OR team_members.session_id = ?
             LIMIT 1`,
          )
          .get(sessionId, sessionId) as TeamRow | undefined,
      );
    },
    async saveTeam(team) {
      database
        .prepare(
          `INSERT INTO teams (
             id, lead_session_id, workspace_id, status, roster_json,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             updated_at = excluded.updated_at`,
        )
        .run(
          team.id,
          team.leadSessionId,
          team.workspaceId,
          team.status,
          team.roster ? JSON.stringify(team.roster) : null,
          team.createdAt,
          team.updatedAt,
        );
    },
    async listTasks(teamId) {
      const rows = database
        .prepare(
          "SELECT * FROM team_tasks WHERE team_id = ? ORDER BY created_at, id",
        )
        .all(teamId) as TeamTaskRow[];
      return rows.map(mapTask);
    },
    async insertTask(task) {
      database
        .prepare(
          `INSERT INTO team_tasks (
             id, team_id, title, description, status, assignee_session_id,
             blocked_by_json, evidence, revision, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          task.id,
          task.teamId,
          task.title,
          task.description,
          task.status,
          task.assigneeSessionId,
          JSON.stringify(task.blockedBy),
          task.evidence,
          task.revision,
          task.createdAt,
          task.updatedAt,
        );
    },
    async updateTask(task, expectedRevision) {
      const result = database
        .prepare(
          `UPDATE team_tasks
           SET status = ?, assignee_session_id = ?, evidence = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND team_id = ? AND revision = ?`,
        )
        .run(
          task.status,
          task.assigneeSessionId,
          task.evidence,
          task.updatedAt,
          task.id,
          task.teamId,
          expectedRevision,
        );
      return result.changes === 1;
    },
    async saveMember(member) {
      database
        .prepare(
          `INSERT INTO team_members (
             team_id, session_id, name, agent_role_id, status, created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(team_id, session_id) DO UPDATE SET
             status = excluded.status,
             updated_at = excluded.updated_at`,
        )
        .run(
          member.teamId,
          member.sessionId,
          member.name,
          member.agentRoleId,
          member.status,
          member.createdAt,
          member.updatedAt,
        );
    },
    async failActiveMembers() {
      database
        .prepare(
          `UPDATE team_members
           SET status = 'error', updated_at = ?
           WHERE status IN ('spawning', 'running')`,
        )
        .run(new Date().toISOString());
    },
  };
}
