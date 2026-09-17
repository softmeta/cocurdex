import type { DatabaseSync } from "node:sqlite";
import type {
  TeamMemberRecord,
  TeamMemberStatus,
  TeamRecord,
  TeamSnapshot,
  TeamStatus,
  TeamTaskLinks,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import type { TeamRepository } from "./team-repository";

interface TeamRow extends SqliteRow {
  id: string;
  lead_session_id: string;
  workspace_id: string;
  issue_view_id: string;
  status: TeamStatus;
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
  team_id: string;
  issue_id: string;
  blocked_by_json: string;
  evidence: string | null;
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

function mapTaskLinks(row: TeamTaskRow): TeamTaskLinks {
  return {
    teamId: row.team_id,
    issueId: row.issue_id,
    blockedBy: parseBlockedBy(row.blocked_by_json),
    evidence: row.evidence,
    updatedAt: row.updated_at,
  };
}

function mapTeam(row: TeamRow): TeamRecord {
  return {
    id: row.id,
    leadSessionId: row.lead_session_id,
    workspaceId: row.workspace_id,
    issueViewId: row.issue_view_id,
    status: row.status,
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
             id, lead_session_id, workspace_id, issue_view_id, status,
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
          team.issueViewId,
          team.status,
          team.createdAt,
          team.updatedAt,
        );
    },
    async listTaskLinks(teamId) {
      const rows = database
        .prepare("SELECT * FROM team_tasks WHERE team_id = ?")
        .all(teamId) as TeamTaskRow[];
      return rows.map(mapTaskLinks);
    },
    async saveTaskLinks(links) {
      database
        .prepare(
          `INSERT INTO team_tasks (
             team_id, issue_id, blocked_by_json, evidence, updated_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(team_id, issue_id) DO UPDATE SET
             blocked_by_json = excluded.blocked_by_json,
             evidence = excluded.evidence,
             updated_at = excluded.updated_at`,
        )
        .run(
          links.teamId,
          links.issueId,
          JSON.stringify(links.blockedBy),
          links.evidence,
          links.updatedAt,
        );
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
  };
}
