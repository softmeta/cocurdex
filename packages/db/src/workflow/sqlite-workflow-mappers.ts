import type {
  WorkflowActionRecord,
  WorkflowArtifactContent,
  WorkflowArtifactRecord,
  WorkflowAttemptRecord,
  WorkflowDefinitionRevision,
  WorkflowExecutorBinding,
  WorkflowExecutorBindings,
  WorkflowGateDecisionRecord,
  WorkflowRunRecord,
  WorkflowStepRunRecord,
  WorkflowSuspensionRecord,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function parseNullableJson(value: unknown): unknown {
  return value === null || value === undefined
    ? null
    : JSON.parse(String(value));
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function mapWorkflowRun(row: SqliteRow): WorkflowRunRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    workspaceRootPath: String(row.workspace_root_path),
    rootPrompt: String(row.root_prompt),
    definitionId: String(
      row.definition_id,
    ) as WorkflowRunRecord["definitionId"],
    definitionVersion: Number(row.definition_version),
    frozenDefinition: parseJson<WorkflowDefinitionRevision>(
      row.frozen_definition_json,
    ),
    frozenBindings: parseJson<WorkflowExecutorBindings>(
      row.frozen_bindings_json,
    ),
    status: String(row.status) as WorkflowRunRecord["status"],
    currentStepId: nullableString(row.current_step_id),
    revision: Number(row.revision),
    transitionCounts: parseJson<Record<string, number>>(
      row.transition_counts_json,
    ),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: nullableString(row.completed_at),
  };
}

export function mapWorkflowStepRun(row: SqliteRow): WorkflowStepRunRecord {
  return {
    id: String(row.id),
    workflowRunId: String(row.workflow_run_id),
    stepId: String(row.step_id),
    kind: String(row.kind) as WorkflowStepRunRecord["kind"],
    role: nullableString(row.role) as WorkflowStepRunRecord["role"],
    status: String(row.status) as WorkflowStepRunRecord["status"],
    attemptCount: Number(row.attempt_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: nullableString(row.completed_at),
  };
}

export function mapWorkflowAttempt(row: SqliteRow): WorkflowAttemptRecord {
  return {
    id: String(row.id),
    workflowRunId: String(row.workflow_run_id),
    stepRunId: String(row.step_run_id),
    sequence: Number(row.sequence),
    executorBinding: parseJson<WorkflowExecutorBinding>(
      row.executor_binding_json,
    ),
    sessionId: nullableString(row.session_id),
    runtimeIdentity: parseJson<WorkflowAttemptRecord["runtimeIdentity"]>(
      row.runtime_identity_json,
    ),
    status: String(row.status) as WorkflowAttemptRecord["status"],
    error: nullableString(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: nullableString(row.completed_at),
  };
}

export function mapWorkflowSuspension(
  row: SqliteRow,
): WorkflowSuspensionRecord {
  return {
    id: String(row.id),
    workflowRunId: String(row.workflow_run_id),
    stepRunId: String(row.step_run_id),
    attemptId: nullableString(row.attempt_id),
    reason: String(row.reason) as WorkflowSuspensionRecord["reason"],
    message: nullableString(row.message),
    continuation: parseNullableJson(row.continuation_json) as Record<
      string,
      unknown
    > | null,
    status: String(row.status) as WorkflowSuspensionRecord["status"],
    createdAt: String(row.created_at),
    resolvedAt: nullableString(row.resolved_at),
  };
}

export function mapWorkflowArtifact(row: SqliteRow): WorkflowArtifactRecord {
  return {
    id: String(row.id),
    workflowRunId: String(row.workflow_run_id),
    producerAttemptId: nullableString(row.producer_attempt_id),
    schemaId: String(row.schema_id) as WorkflowArtifactRecord["schemaId"],
    content: parseJson<WorkflowArtifactContent>(row.content_json),
    contentHash: String(row.content_hash),
    baselineCommit: nullableString(row.baseline_commit),
    createdAt: String(row.created_at),
  };
}

export function mapWorkflowGateDecision(
  row: SqliteRow,
): WorkflowGateDecisionRecord {
  return {
    id: String(row.id),
    workflowRunId: String(row.workflow_run_id),
    stepRunId: String(row.step_run_id),
    decision: String(row.decision) as WorkflowGateDecisionRecord["decision"],
    actor: String(row.actor) as WorkflowGateDecisionRecord["actor"],
    reason: nullableString(row.reason),
    createdAt: String(row.created_at),
  };
}

export function mapWorkflowAction(row: SqliteRow): WorkflowActionRecord {
  return {
    id: String(row.id),
    workflowRunId: String(row.workflow_run_id),
    stepRunId: String(row.step_run_id),
    type: String(row.type) as WorkflowActionRecord["type"],
    idempotencyKey: String(row.idempotency_key),
    payload: parseJson<Record<string, unknown>>(row.payload_json),
    status: String(row.status) as WorkflowActionRecord["status"],
    attemptCount: Number(row.attempt_count),
    availableAt: String(row.available_at),
    leaseOwner: nullableString(row.lease_owner),
    leaseExpiresAt: nullableString(row.lease_expires_at),
    result: parseNullableJson(row.result_json),
    error: nullableString(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
