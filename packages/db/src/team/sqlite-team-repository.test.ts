import { DatabaseSync } from "node:sqlite";
import type { TeamRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "../migrations";
import { createSqliteTeamRepository } from "./sqlite-team-repository";

const now = "2026-10-07T00:00:00.000Z";

function seededDatabase() {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  database.exec(`
    INSERT INTO workspaces (id, name, root_paths, created_at, updated_at, last_opened_at)
    VALUES ('w1', 'Repo', '["/repo"]', '${now}', '${now}', '${now}');
    INSERT INTO sessions (id, workspace_id, title, agent_type, status, write_mode, created_at, updated_at)
    VALUES ('lead', 'w1', 'Lead', 'codex', 'idle', 'read-only', '${now}', '${now}');
  `);
  return database;
}

function team(overrides: Partial<TeamRecord> = {}): TeamRecord {
  return {
    id: "t1",
    leadSessionId: "lead",
    workspaceId: "w1",
    status: "active",
    roster: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("sqlite team repository", () => {
  it("persists a team roster and keeps it when the status changes", async () => {
    const repository = createSqliteTeamRepository(seededDatabase());
    const roster = {
      templateId: "tpl-1",
      name: "Review squad",
      description: "Reviews changes",
      leadPrompt: "Own the merge.",
      members: [{ name: "reviewer", agentRoleId: "role-1", prompt: "Review." }],
    };
    await repository.saveTeam(team({ roster }));
    await repository.saveTeam(team({ roster: null, status: "stopped" }));

    expect((await repository.getByLead("lead"))?.team).toMatchObject({
      status: "stopped",
      roster,
    });
  });

  it("reads teams created before rosters as having none", async () => {
    const database = seededDatabase();
    database.exec(`
      INSERT INTO teams (id, lead_session_id, workspace_id, status, created_at, updated_at)
      VALUES ('t1', 'lead', 'w1', 'active', '${now}', '${now}');
    `);
    const repository = createSqliteTeamRepository(database);

    expect((await repository.getById("t1"))?.team.roster).toBeNull();
  });
});
