import type { DatabaseSync } from "node:sqlite";
import type {
  WorkflowActionRecord,
  WorkflowAggregate,
  WorkflowArtifactRecord,
  WorkflowAttemptRecord,
  WorkflowGateDecisionRecord,
  WorkflowRunRecord,
  WorkflowStepRunRecord,
  WorkflowSuspensionRecord,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import {
  claimWorkflowAction,
  renewWorkflowActionLease,
  settleWorkflowAction,
} from "./sqlite-workflow-action-store";
import {
  mapWorkflowAction,
  mapWorkflowArtifact,
  mapWorkflowAttempt,
  mapWorkflowGateDecision,
  mapWorkflowRun,
  mapWorkflowStepRun,
  mapWorkflowSuspension,
} from "./sqlite-workflow-mappers";
import {
  type WorkflowRepository,
  WorkflowRevisionConflictError,
} from "./workflow-repository";

function runTransaction<T>(database: DatabaseSync, fn: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function insertRun(database: DatabaseSync, run: WorkflowRunRecord): void {
  database
    .prepare(
      `INSERT INTO workflow_runs (
         id, workspace_id, workspace_root_path, root_prompt, definition_id,
         definition_version, frozen_definition_json, frozen_bindings_json,
         status, current_step_id, revision, transition_counts_json, created_at,
         updated_at, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      run.id,
      run.workspaceId,
      run.workspaceRootPath,
      run.rootPrompt,
      run.definitionId,
      run.definitionVersion,
      JSON.stringify(run.frozenDefinition),
      JSON.stringify(run.frozenBindings),
      run.status,
      run.currentStepId,
      run.revision,
      JSON.stringify(run.transitionCounts),
      run.createdAt,
      run.updatedAt,
      run.completedAt,
    );
}

function updateRun(
  database: DatabaseSync,
  run: WorkflowRunRecord,
  expectedRevision: number,
): void {
  const result = database
    .prepare(
      `UPDATE workflow_runs
       SET status = ?, current_step_id = ?, revision = ?,
           transition_counts_json = ?, updated_at = ?, completed_at = ?
       WHERE id = ? AND revision = ?`,
    )
    .run(
      run.status,
      run.currentStepId,
      run.revision,
      JSON.stringify(run.transitionCounts),
      run.updatedAt,
      run.completedAt,
      run.id,
      expectedRevision,
    );
  if (Number(result.changes) !== 1) {
    throw new WorkflowRevisionConflictError(
      `Workflow '${run.id}' changed after revision ${expectedRevision}.`,
    );
  }
}

function upsertStep(database: DatabaseSync, step: WorkflowStepRunRecord): void {
  database
    .prepare(
      `INSERT INTO workflow_step_runs (
         id, workflow_run_id, step_id, kind, role, status, attempt_count,
         created_at, updated_at, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         attempt_count = excluded.attempt_count,
         updated_at = excluded.updated_at,
         completed_at = excluded.completed_at`,
    )
    .run(
      step.id,
      step.workflowRunId,
      step.stepId,
      step.kind,
      step.role,
      step.status,
      step.attemptCount,
      step.createdAt,
      step.updatedAt,
      step.completedAt,
    );
}

function upsertAttempt(
  database: DatabaseSync,
  attempt: WorkflowAttemptRecord,
): void {
  database
    .prepare(
      `INSERT INTO workflow_attempts (
         id, workflow_run_id, step_run_id, sequence, executor_binding_json,
         session_id, runtime_identity_json, status, error, created_at,
         updated_at, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         session_id = excluded.session_id,
         runtime_identity_json = excluded.runtime_identity_json,
         status = excluded.status,
         error = excluded.error,
         updated_at = excluded.updated_at,
         completed_at = excluded.completed_at`,
    )
    .run(
      attempt.id,
      attempt.workflowRunId,
      attempt.stepRunId,
      attempt.sequence,
      JSON.stringify(attempt.executorBinding),
      attempt.sessionId,
      JSON.stringify(attempt.runtimeIdentity),
      attempt.status,
      attempt.error,
      attempt.createdAt,
      attempt.updatedAt,
      attempt.completedAt,
    );
}

function upsertSuspension(
  database: DatabaseSync,
  suspension: WorkflowSuspensionRecord,
): void {
  database
    .prepare(
      `INSERT INTO workflow_suspensions (
         id, workflow_run_id, step_run_id, attempt_id, reason, message,
         continuation_json, status, created_at, resolved_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         resolved_at = excluded.resolved_at`,
    )
    .run(
      suspension.id,
      suspension.workflowRunId,
      suspension.stepRunId,
      suspension.attemptId,
      suspension.reason,
      suspension.message,
      suspension.continuation === null
        ? null
        : JSON.stringify(suspension.continuation),
      suspension.status,
      suspension.createdAt,
      suspension.resolvedAt,
    );
}

function insertArtifact(
  database: DatabaseSync,
  artifact: WorkflowArtifactRecord,
): void {
  database
    .prepare(
      `INSERT OR IGNORE INTO workflow_artifacts (
         id, workflow_run_id, producer_attempt_id, schema_id, content_json,
         content_hash, baseline_commit, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      artifact.id,
      artifact.workflowRunId,
      artifact.producerAttemptId,
      artifact.schemaId,
      JSON.stringify(artifact.content),
      artifact.contentHash,
      artifact.baselineCommit,
      artifact.createdAt,
    );
}

function insertGateDecision(
  database: DatabaseSync,
  decision: WorkflowGateDecisionRecord,
): void {
  database
    .prepare(
      `INSERT OR IGNORE INTO workflow_gate_decisions (
         id, workflow_run_id, step_run_id, decision, actor, reason, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      decision.id,
      decision.workflowRunId,
      decision.stepRunId,
      decision.decision,
      decision.actor,
      decision.reason,
      decision.createdAt,
    );
}

function insertAction(
  database: DatabaseSync,
  action: WorkflowActionRecord,
): void {
  database
    .prepare(
      `INSERT INTO workflow_actions (
         id, workflow_run_id, step_run_id, type, idempotency_key, payload_json,
         status, attempt_count, available_at, lease_owner, lease_expires_at,
         result_json, error, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(
      action.id,
      action.workflowRunId,
      action.stepRunId,
      action.type,
      action.idempotencyKey,
      JSON.stringify(action.payload),
      action.status,
      action.attemptCount,
      action.availableAt,
      action.leaseOwner,
      action.leaseExpiresAt,
      action.result === null ? null : JSON.stringify(action.result),
      action.error,
      action.createdAt,
      action.updatedAt,
    );
  if (action.status === "cancelled") {
    database
      .prepare(
        `UPDATE workflow_actions
         SET status = 'cancelled', lease_owner = NULL,
             lease_expires_at = NULL, error = ?, updated_at = ?
         WHERE id = ? AND status IN ('pending', 'claimed')`,
      )
      .run(action.error, action.updatedAt, action.id);
  }
}

function writeChildren(
  database: DatabaseSync,
  aggregate: WorkflowAggregate,
  skipActionUpdateId?: string,
) {
  for (const step of aggregate.steps) upsertStep(database, step);
  for (const attempt of aggregate.attempts) upsertAttempt(database, attempt);
  for (const artifact of aggregate.artifacts)
    insertArtifact(database, artifact);
  for (const decision of aggregate.gateDecisions) {
    insertGateDecision(database, decision);
  }
  for (const suspension of aggregate.suspensions) {
    upsertSuspension(database, suspension);
  }
  for (const action of aggregate.actions) {
    if (action.id !== skipActionUpdateId) insertAction(database, action);
  }
}

function rows<T>(
  database: DatabaseSync,
  sql: string,
  runId: string,
  map: (row: SqliteRow) => T,
): T[] {
  return (database.prepare(sql).all(runId) as SqliteRow[]).map(map);
}

function getAggregate(
  database: DatabaseSync,
  runId: string,
): WorkflowAggregate | null {
  const runRow = database
    .prepare("SELECT * FROM workflow_runs WHERE id = ?")
    .get(runId) as SqliteRow | undefined;
  if (!runRow) return null;
  return {
    run: mapWorkflowRun(runRow),
    steps: rows(
      database,
      "SELECT * FROM workflow_step_runs WHERE workflow_run_id = ? ORDER BY rowid",
      runId,
      mapWorkflowStepRun,
    ),
    attempts: rows(
      database,
      "SELECT * FROM workflow_attempts WHERE workflow_run_id = ? ORDER BY rowid",
      runId,
      mapWorkflowAttempt,
    ),
    artifacts: rows(
      database,
      "SELECT * FROM workflow_artifacts WHERE workflow_run_id = ? ORDER BY rowid",
      runId,
      mapWorkflowArtifact,
    ),
    gateDecisions: rows(
      database,
      "SELECT * FROM workflow_gate_decisions WHERE workflow_run_id = ? ORDER BY rowid",
      runId,
      mapWorkflowGateDecision,
    ),
    suspensions: rows(
      database,
      "SELECT * FROM workflow_suspensions WHERE workflow_run_id = ? ORDER BY rowid",
      runId,
      mapWorkflowSuspension,
    ),
    actions: rows(
      database,
      "SELECT * FROM workflow_actions WHERE workflow_run_id = ? ORDER BY rowid",
      runId,
      mapWorkflowAction,
    ),
  };
}

export function createSqliteWorkflowRepository(
  database: DatabaseSync,
): WorkflowRepository {
  return {
    async listRuns() {
      return (
        database
          .prepare(
            `SELECT * FROM workflow_runs
             ORDER BY updated_at DESC, created_at DESC`,
          )
          .all() as SqliteRow[]
      ).map(mapWorkflowRun);
    },
    async get(runId) {
      return getAggregate(database, runId);
    },
    async create(aggregate) {
      runTransaction(database, () => {
        insertRun(database, aggregate.run);
        writeChildren(database, aggregate);
      });
    },
    async commit(aggregate, expectedRevision) {
      runTransaction(database, () => {
        updateRun(database, aggregate.run, expectedRevision);
        writeChildren(database, aggregate);
      });
    },
    async claimNextAction(input) {
      return claimWorkflowAction(database, input);
    },
    async renewActionLease(input) {
      return renewWorkflowActionLease(database, input);
    },
    async settleAction(input) {
      return settleWorkflowAction(database, input, () => {
        updateRun(database, input.aggregate.run, input.expectedRevision);
        writeChildren(database, input.aggregate, input.actionId);
      });
    },
  };
}
