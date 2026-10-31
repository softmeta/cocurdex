export function createHostAccessSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS host_devices (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scopes_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS host_pairings (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      scopes_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      device_id TEXT,
      FOREIGN KEY (device_id) REFERENCES host_devices(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS host_access_audit (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      subject TEXT,
      remote_address TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_host_access_audit_at
      ON host_access_audit(at);
  `;
}
