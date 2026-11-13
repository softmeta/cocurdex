import type { DatabaseSync } from "node:sqlite";
import type { SqliteRow } from "../sqlite-types";
import type {
  PersonalAgentRepository,
  PersonalAgentRow,
} from "./personal-agent-repository";

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function mapPersonalAgent(row: SqliteRow): PersonalAgentRow {
  return {
    id: String(row.id),
    roleId: String(row.role_id),
    homeSessionId: String(row.home_session_id),
    soul: nullableString(row.soul),
    userAddress: nullableString(row.user_address),
    isDefault: Number(row.is_default) === 1,
    pinnedAt: nullableString(row.pinned_at),
    mutedAt: nullableString(row.muted_at),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createSqlitePersonalAgentRepository(
  database: DatabaseSync,
): PersonalAgentRepository {
  const one = (sql: string, value: string | number) => {
    const row = database.prepare(sql).get(value) as SqliteRow | undefined;
    return row ? mapPersonalAgent(row) : null;
  };
  return {
    list() {
      const rows = database
        .prepare(
          "SELECT * FROM personal_agents ORDER BY sort_order ASC, created_at ASC",
        )
        .all() as SqliteRow[];
      return rows.map(mapPersonalAgent);
    },
    getById(id) {
      return one("SELECT * FROM personal_agents WHERE id = ?", id);
    },
    findByRole(roleId) {
      return one("SELECT * FROM personal_agents WHERE role_id = ?", roleId);
    },
    findByHomeSession(sessionId) {
      return one(
        "SELECT * FROM personal_agents WHERE home_session_id = ?",
        sessionId,
      );
    },
    getDefault() {
      return one("SELECT * FROM personal_agents WHERE is_default = ?", 1);
    },
    upsert(agent) {
      database
        .prepare(
          `INSERT INTO personal_agents (
             id, role_id, home_session_id, soul, user_address, is_default,
             pinned_at, muted_at, sort_order, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             soul = excluded.soul,
             user_address = excluded.user_address,
             is_default = excluded.is_default,
             pinned_at = excluded.pinned_at,
             muted_at = excluded.muted_at,
             sort_order = excluded.sort_order,
             updated_at = excluded.updated_at`,
        )
        .run(
          agent.id,
          agent.roleId,
          agent.homeSessionId,
          agent.soul,
          agent.userAddress,
          agent.isDefault ? 1 : 0,
          agent.pinnedAt,
          agent.mutedAt,
          agent.sortOrder,
          agent.createdAt,
          agent.updatedAt,
        );
    },
    delete(id) {
      database.prepare("DELETE FROM personal_agents WHERE id = ?").run(id);
    },
  };
}
