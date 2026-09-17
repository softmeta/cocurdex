import type { DatabaseSync } from "node:sqlite";
import type {
  ScriptRunAgentRecord,
  ScriptRunAgentStatus,
  ScriptRunRecord,
  ScriptRunStatus,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import type { ScriptRunRepository } from "./script-run-repository";

interface ScriptRunRow extends SqliteRow {
  id: string;
  workspace_id: string;
  requester_session_id: string;
  name: string;
  script: string;
  status: ScriptRunStatus;
  max_agents: number;
  agent_count: number;
  result_json: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ScriptRunAgentRow extends SqliteRow {
  id: string;
  run_id: string;
  session_id: string;
  label: string;
  status: ScriptRunAgentStatus;
  result_json: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

function mapRun(row: ScriptRunRow): ScriptRunRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    requesterSessionId: row.requester_session_id,
    name: row.name,
    script: row.script,
    status: row.status,
    maxAgents: Number(row.max_agents),
    agentCount: Number(row.agent_count),
    resultJson: row.result_json,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function mapAgent(row: ScriptRunAgentRow): ScriptRunAgentRecord {
  return {
    id: row.id,
    runId: row.run_id,
    sessionId: row.session_id,
    label: row.label,
    status: row.status,
    resultJson: row.result_json,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function createSqliteScriptRunRepository(
  database: DatabaseSync,
): ScriptRunRepository {
  return {
    async saveRun(run) {
      database
        .prepare(
          `INSERT INTO script_runs (
             id, workspace_id, requester_session_id, name, script, status,
             max_agents, agent_count, result_json, error, created_at,
             started_at, completed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             max_agents = excluded.max_agents,
             agent_count = excluded.agent_count,
             result_json = excluded.result_json,
             error = excluded.error,
             started_at = excluded.started_at,
             completed_at = excluded.completed_at`,
        )
        .run(
          run.id,
          run.workspaceId,
          run.requesterSessionId,
          run.name,
          run.script,
          run.status,
          run.maxAgents,
          run.agentCount,
          run.resultJson,
          run.error,
          run.createdAt,
          run.startedAt,
          run.completedAt,
        );
    },
    async getRun(runId) {
      const row = database
        .prepare("SELECT * FROM script_runs WHERE id = ?")
        .get(runId) as ScriptRunRow | undefined;
      if (!row) return null;
      const agents = database
        .prepare(
          "SELECT * FROM script_run_agents WHERE run_id = ? ORDER BY created_at, id",
        )
        .all(runId) as ScriptRunAgentRow[];
      return { run: mapRun(row), agents: agents.map(mapAgent) };
    },
    async listRuns(filter) {
      const rows = database
        .prepare(
          `SELECT * FROM script_runs
           WHERE (?1 IS NULL OR workspace_id = ?1)
             AND (?2 IS NULL OR requester_session_id = ?2)
           ORDER BY created_at DESC, id`,
        )
        .all(
          filter.workspaceId ?? null,
          filter.requesterSessionId ?? null,
        ) as ScriptRunRow[];
      return rows.map(mapRun);
    },
    async saveAgent(agent) {
      database
        .prepare(
          `INSERT INTO script_run_agents (
             id, run_id, session_id, label, status, result_json, error,
             created_at, completed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             result_json = excluded.result_json,
             error = excluded.error,
             completed_at = excluded.completed_at`,
        )
        .run(
          agent.id,
          agent.runId,
          agent.sessionId,
          agent.label,
          agent.status,
          agent.resultJson,
          agent.error,
          agent.createdAt,
          agent.completedAt,
        );
    },
    async interruptRunning(now) {
      const rows = database
        .prepare("SELECT * FROM script_runs WHERE status = 'running'")
        .all() as ScriptRunRow[];
      database
        .prepare(
          `UPDATE script_run_agents SET status = 'cancelled', completed_at = ?
           WHERE status IN ('queued', 'running')
             AND run_id IN (SELECT id FROM script_runs WHERE status = 'running')`,
        )
        .run(now);
      database
        .prepare(
          `UPDATE script_runs SET status = 'interrupted', completed_at = ?
           WHERE status = 'running'`,
        )
        .run(now);
      return rows.map((row) => ({
        ...mapRun(row),
        status: "interrupted" as const,
        completedAt: now,
      }));
    },
  };
}
