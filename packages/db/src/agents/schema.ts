export function createAgentCapabilityCacheSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS agent_capability_cache (
      agent_id TEXT NOT NULL,
      version TEXT NOT NULL,
      capabilities_json TEXT NOT NULL,
      probed_at TEXT NOT NULL,
      PRIMARY KEY (agent_id, version)
    );
  `;
}
