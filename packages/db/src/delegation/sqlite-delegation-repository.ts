import type { DatabaseSync } from "node:sqlite";
import type { RemoteWorkSnapshot } from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import type {
  DelegationRepository,
  DelegationRow,
} from "./delegation-repository";

function toRow(row: SqliteRow): DelegationRow {
  return {
    workSessionId: String(row.work_session_id),
    personaId: String(row.persona_id),
    requesterSessionId: String(row.requester_session_id),
    teamTemplateId:
      typeof row.team_template_id === "string" ? row.team_template_id : null,
    createdAt: String(row.created_at),
    remote: parseRemote(row),
  };
}

function parseRemote(row: SqliteRow): RemoteWorkSnapshot | null {
  if (typeof row.remote_host_id !== "string") return null;
  if (typeof row.remote_json !== "string") return null;
  const stored = JSON.parse(row.remote_json) as Omit<
    RemoteWorkSnapshot,
    "hostId"
  >;
  return { ...stored, hostId: row.remote_host_id };
}

function remoteJson(remote: RemoteWorkSnapshot | null) {
  if (!remote) return null;
  const { hostId: _hostId, ...stored } = remote;
  return JSON.stringify(stored);
}

export function createSqliteDelegationRepository(
  database: DatabaseSync,
): DelegationRepository {
  const insert = database.prepare(`
    INSERT INTO delegations
      (work_session_id, persona_id, requester_session_id, team_template_id, created_at, remote_host_id, remote_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const get = database.prepare(
    "SELECT * FROM delegations WHERE work_session_id = ?",
  );
  const listByPersona = database.prepare(`
    SELECT * FROM delegations
    WHERE persona_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const list = database.prepare(
    "SELECT * FROM delegations ORDER BY created_at",
  );
  const listRemote = database.prepare(
    "SELECT * FROM delegations WHERE remote_host_id IS NOT NULL ORDER BY created_at",
  );
  const removeByRemoteHost = database.prepare(
    "DELETE FROM delegations WHERE remote_host_id = ?",
  );
  const remove = database.prepare(
    "DELETE FROM delegations WHERE work_session_id = ?",
  );
  const removeByPersona = database.prepare(
    "DELETE FROM delegations WHERE persona_id = ?",
  );

  return {
    insert(row) {
      insert.run(
        row.workSessionId,
        row.personaId,
        row.requesterSessionId,
        row.teamTemplateId,
        row.createdAt,
        row.remote?.hostId ?? null,
        remoteJson(row.remote),
      );
    },
    get(workSessionId) {
      const row = get.get(workSessionId) as SqliteRow | undefined;
      return row ? toRow(row) : null;
    },
    listByPersona(personaId, limit) {
      return (listByPersona.all(personaId, limit) as SqliteRow[]).map(toRow);
    },
    list() {
      return (list.all() as SqliteRow[]).map(toRow);
    },
    listRemote() {
      return (listRemote.all() as SqliteRow[]).map(toRow);
    },
    deleteByRemoteHost(hostId) {
      removeByRemoteHost.run(hostId);
    },
    delete(workSessionId) {
      remove.run(workSessionId);
    },
    deleteByPersona(personaId) {
      removeByPersona.run(personaId);
    },
  };
}
