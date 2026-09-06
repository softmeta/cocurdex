import type { DatabaseSync } from "node:sqlite";
import type { AgentRoleRecord } from "@cocurdex/shared";
import { mapAgentRole } from "../mappers";
import type { SqliteRow } from "../sqlite-types";
import type { AgentRoleRepository } from "./agent-role-repository";

export function createSqliteAgentRoleRepository(
  database: DatabaseSync,
): AgentRoleRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT * FROM agent_roles
           ORDER BY updated_at DESC, name ASC`,
        )
        .all() as SqliteRow[];
      return rows.map(mapAgentRole);
    },
    async getById(id) {
      const row = database
        .prepare("SELECT * FROM agent_roles WHERE id = ?")
        .get(id) as SqliteRow | undefined;
      return row ? mapAgentRole(row) : null;
    },
    async upsert(role: AgentRoleRecord) {
      database
        .prepare(
          `INSERT INTO agent_roles (
             id, name, agent_id, provider_id, model_id, model_name,
             permission_mode, collaboration_mode, reasoning_effort,
             service_tier, fast_mode, thinking_level, opencode_agent,
             opencode_variant, instructions, skill_ids_json, created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             agent_id = excluded.agent_id,
             provider_id = excluded.provider_id,
             model_id = excluded.model_id,
             model_name = excluded.model_name,
             permission_mode = excluded.permission_mode,
             collaboration_mode = excluded.collaboration_mode,
             reasoning_effort = excluded.reasoning_effort,
             service_tier = excluded.service_tier,
             fast_mode = excluded.fast_mode,
             thinking_level = excluded.thinking_level,
             opencode_agent = excluded.opencode_agent,
             opencode_variant = excluded.opencode_variant,
             instructions = excluded.instructions,
             skill_ids_json = excluded.skill_ids_json,
             updated_at = excluded.updated_at`,
        )
        .run(
          role.id,
          role.name,
          role.agentId,
          role.providerId,
          role.modelId,
          role.modelName,
          role.permissionMode,
          role.collaborationMode,
          role.reasoningEffort,
          role.serviceTier,
          role.fastMode === null ? null : role.fastMode ? 1 : 0,
          role.thinkingLevel,
          role.openCodeAgent,
          role.openCodeVariant,
          role.instructions,
          role.skillIds ? JSON.stringify(role.skillIds) : null,
          role.createdAt,
          role.updatedAt,
        );
    },
    async delete(id) {
      database.prepare("DELETE FROM agent_roles WHERE id = ?").run(id);
    },
  };
}
