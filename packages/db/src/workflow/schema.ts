export function createWorkflowSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      workspace_root_path TEXT NOT NULL,
      root_prompt TEXT NOT NULL,
      definition_id TEXT NOT NULL,
      definition_version INTEGER NOT NULL,
      frozen_definition_json TEXT NOT NULL,
      frozen_bindings_json TEXT NOT NULL,
      status TEXT NOT NULL,
      current_step_id TEXT,
      revision INTEGER NOT NULL,
      transition_counts_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_step_runs (
      id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      role TEXT,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
        ON DELETE CASCADE,
      UNIQUE(workflow_run_id, step_id)
    );

    CREATE TABLE IF NOT EXISTS workflow_attempts (
      id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL,
      step_run_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      executor_binding_json TEXT NOT NULL,
      session_id TEXT,
      runtime_identity_json TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
        ON DELETE CASCADE,
      FOREIGN KEY (step_run_id) REFERENCES workflow_step_runs(id)
        ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      UNIQUE(step_run_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS workflow_artifacts (
      id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL,
      producer_attempt_id TEXT,
      schema_id TEXT NOT NULL,
      content_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      baseline_commit TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
        ON DELETE CASCADE,
      FOREIGN KEY (producer_attempt_id) REFERENCES workflow_attempts(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_gate_decisions (
      id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL,
      step_run_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      actor TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
        ON DELETE CASCADE,
      FOREIGN KEY (step_run_id) REFERENCES workflow_step_runs(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_suspensions (
      id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL,
      step_run_id TEXT NOT NULL,
      attempt_id TEXT,
      reason TEXT NOT NULL,
      message TEXT,
      continuation_json TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
        ON DELETE CASCADE,
      FOREIGN KEY (step_run_id) REFERENCES workflow_step_runs(id)
        ON DELETE CASCADE,
      FOREIGN KEY (attempt_id) REFERENCES workflow_attempts(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_actions (
      id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL,
      step_run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      available_at TEXT NOT NULL,
      lease_owner TEXT,
      lease_expires_at TEXT,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
        ON DELETE CASCADE,
      FOREIGN KEY (step_run_id) REFERENCES workflow_step_runs(id)
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_runs_updated
      ON workflow_runs(updated_at DESC, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run
      ON workflow_step_runs(workflow_run_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_workflow_attempts_run_step
      ON workflow_attempts(workflow_run_id, step_run_id, sequence);

    CREATE INDEX IF NOT EXISTS idx_workflow_attempts_session
      ON workflow_attempts(session_id);

    CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_run
      ON workflow_artifacts(workflow_run_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_workflow_gate_decisions_run
      ON workflow_gate_decisions(workflow_run_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_workflow_suspensions_run
      ON workflow_suspensions(workflow_run_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_workflow_actions_claim
      ON workflow_actions(status, available_at, lease_expires_at, created_at);
  `;
}
