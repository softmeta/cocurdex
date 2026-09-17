import type { DatabaseSync } from "node:sqlite";
import type { AgentCapabilities } from "@cocurdex/shared";
import type {
  AgentCapabilityCacheEntry,
  AgentCapabilityCacheRepository,
} from "./agent-capability-cache-repository";

export function createSqliteAgentCapabilityCacheRepository(
  database: DatabaseSync,
): AgentCapabilityCacheRepository {
  return {
    async get(agentId, version) {
      const row = database
        .prepare(
          `SELECT capabilities_json, probed_at
           FROM agent_capability_cache
           WHERE agent_id = ? AND version = ?`,
        )
        .get(agentId, version) as
        | { capabilities_json?: unknown; probed_at?: unknown }
        | undefined;
      if (
        typeof row?.capabilities_json !== "string" ||
        typeof row.probed_at !== "string"
      ) {
        return null;
      }

      try {
        return {
          capabilities: JSON.parse(
            row.capabilities_json,
          ) as Partial<AgentCapabilities>,
          probedAt: row.probed_at,
        };
      } catch {
        return null;
      }
    },
    async set(agentId, version, entry: AgentCapabilityCacheEntry) {
      database
        .prepare(
          `INSERT INTO agent_capability_cache (
             agent_id, version, capabilities_json, probed_at
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(agent_id, version) DO UPDATE SET
             capabilities_json = excluded.capabilities_json,
             probed_at = excluded.probed_at`,
        )
        .run(
          agentId,
          version,
          JSON.stringify(entry.capabilities),
          entry.probedAt,
        );
    },
  };
}
