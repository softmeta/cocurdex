import type { DatabaseSync } from "node:sqlite";

const PERSONA_ROLES = "SELECT role_id FROM personal_agents";
const PERSONA_SESSIONS = `
  SELECT home_session_id FROM personal_agents
  UNION
  SELECT session_id FROM routines
  WHERE session_id IS NOT NULL
    AND agent_id IN (SELECT id FROM personal_agents)
`;

export function migratePersonasToPi(database: DatabaseSync): void {
  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE agent_roles
       SET agent_id = 'pi',
           provider_id = CASE WHEN EXISTS (
             SELECT 1 FROM provider_models m
             WHERE m.provider_id = agent_roles.provider_id
               AND m.model_id = agent_roles.model_id
           ) THEN provider_id ELSE (
             SELECT provider_id FROM agent_provider_defaults WHERE agent_id = 'pi'
           ) END,
           model_name = CASE WHEN EXISTS (
             SELECT 1 FROM provider_models m
             WHERE m.provider_id = agent_roles.provider_id
               AND m.model_id = agent_roles.model_id
           ) THEN model_name ELSE NULL END,
           model_id = CASE WHEN EXISTS (
             SELECT 1 FROM provider_models m
             WHERE m.provider_id = agent_roles.provider_id
               AND m.model_id = agent_roles.model_id
           ) THEN model_id ELSE (
             SELECT model_id FROM agent_provider_defaults WHERE agent_id = 'pi'
           ) END,
           session_mode_id = NULL,
           reasoning_effort = NULL,
           service_tier = NULL,
           fast_mode = NULL,
           opencode_agent = NULL,
           opencode_variant = NULL,
           updated_at = ?
       WHERE agent_id <> 'pi' AND id IN (${PERSONA_ROLES})`,
    )
    .run(now);
  database
    .prepare(
      `UPDATE sessions
       SET agent_type = 'pi',
           provider_snapshot_json = NULL,
           session_mode_id = NULL,
           permission_mode = NULL,
           updated_at = ?
       WHERE agent_type <> 'pi' AND id IN (${PERSONA_SESSIONS})`,
    )
    .run(now);
}
