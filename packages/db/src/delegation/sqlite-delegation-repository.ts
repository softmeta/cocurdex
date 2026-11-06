import type { DatabaseSync } from "node:sqlite";
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
  };
}

export function createSqliteDelegationRepository(
  database: DatabaseSync,
): DelegationRepository {
  const insert = database.prepare(`
    INSERT INTO delegations
      (work_session_id, persona_id, requester_session_id, team_template_id, created_at)
    VALUES (?, ?, ?, ?, ?)
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
    delete(workSessionId) {
      remove.run(workSessionId);
    },
    deleteByPersona(personaId) {
      removeByPersona.run(personaId);
    },
  };
}
