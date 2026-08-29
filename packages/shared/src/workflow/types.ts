import type { AgentId, AgentProviderSnapshot } from "../contracts";

export const PLAN_EXECUTE_REVIEW_WORKFLOW_ID = "plan_execute_review" as const;

export type WorkflowDefinitionId = typeof PLAN_EXECUTE_REVIEW_WORKFLOW_ID;
export type WorkflowStepKind = "agent" | "gate" | "validation";
export type WorkflowRole = "planner" | "implementer" | "reviewer";
export type WorkflowPermissionProfile =
  | "read_only"
  | "workspace_write"
  | "validation";
export type WorkflowArtifactSchemaId =
  | "plan_artifact.v1"
  | "change_set.v1"
  | "validation_report.v1"
  | "review_decision.v1";

export interface PlanArtifactV1 {
  summary: string;
  steps?: string[];
  acceptanceCriteria?: string[];
}

export interface ChangeSetV1 {
  summary: string;
  changedFiles: string[];
  workspaceRef?: string;
}

export interface ValidationReportV1 {
  status: "passed" | "failed";
  checks: Array<{
    name: string;
    status: "passed" | "failed" | "skipped";
    details?: string;
  }>;
}

export interface ReviewDecisionV1 {
  verdict: "accepted" | "changes_requested" | "blocked";
  summary?: string;
  findings?: string[];
}

export type WorkflowArtifactInput =
  | {
      schemaId: "plan_artifact.v1";
      content: PlanArtifactV1;
      contentHash: string;
      baselineCommit?: string;
    }
  | {
      schemaId: "change_set.v1";
      content: ChangeSetV1;
      contentHash: string;
      baselineCommit?: string;
    }
  | {
      schemaId: "validation_report.v1";
      content: ValidationReportV1;
      contentHash: string;
      baselineCommit?: string;
    }
  | {
      schemaId: "review_decision.v1";
      content: ReviewDecisionV1;
      contentHash: string;
      baselineCommit?: string;
    };

export type WorkflowArtifactContent = WorkflowArtifactInput["content"];
export type WorkflowTransitionOutcome =
  | "completed"
  | "approved"
  | "rejected"
  | "passed"
  | "failed"
  | "accepted"
  | "changes_requested"
  | "blocked";

export interface WorkflowStepDefinition {
  id: string;
  kind: WorkflowStepKind;
  role?: WorkflowRole;
  permissionProfile: WorkflowPermissionProfile;
  inputSchemas: WorkflowArtifactSchemaId[];
  outputSchema?: WorkflowArtifactSchemaId;
  maxAttempts: number;
}

export interface WorkflowTransitionDefinition {
  from: string;
  outcome: WorkflowTransitionOutcome;
  to?: string;
  terminalStatus?: WorkflowRunStatus;
  maxTraversals?: number;
}

export interface WorkflowDefinitionRevision {
  definitionId: WorkflowDefinitionId;
  version: number;
  steps: WorkflowStepDefinition[];
  transitions: WorkflowTransitionDefinition[];
}

export interface WorkflowExecutorBinding {
  agentId: AgentId;
  model?: string;
  providerSnapshot?: AgentProviderSnapshot;
  runtime?: Record<string, unknown>;
  permissionProfile: WorkflowPermissionProfile;
}

export type WorkflowExecutorBindings = Record<
  WorkflowRole,
  WorkflowExecutorBinding
>;

export type WorkflowRunStatus =
  | "created"
  | "running"
  | "awaiting_gate"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "exhausted";

export type WorkflowStepRunStatus =
  | "pending"
  | "ready"
  | "running"
  | "awaiting_gate"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowAttemptStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface WorkflowAttemptRuntimeIdentity {
  adapterId: AgentId;
  providerSessionId: string | null;
  providerOperationId: string | null;
  resumeToken: string | null;
}

export type WorkflowSuspensionReason =
  | "approval_required"
  | "provider_interaction_required"
  | "infrastructure_unavailable"
  | "budget_exhausted";
export type WorkflowSuspensionStatus = "active" | "resolved" | "cancelled";

export type WorkflowActionType =
  | "execute_agent_step"
  | "request_gate_decision"
  | "execute_validation_step";
export type WorkflowActionStatus =
  | "pending"
  | "claimed"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkflowRunRecord {
  id: string;
  workspaceId: string;
  workspaceRootPath: string;
  rootPrompt: string;
  definitionId: WorkflowDefinitionId;
  definitionVersion: number;
  frozenDefinition: WorkflowDefinitionRevision;
  frozenBindings: WorkflowExecutorBindings;
  status: WorkflowRunStatus;
  currentStepId: string | null;
  revision: number;
  transitionCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkflowStepRunRecord {
  id: string;
  workflowRunId: string;
  stepId: string;
  kind: WorkflowStepKind;
  role: WorkflowRole | null;
  status: WorkflowStepRunStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkflowAttemptRecord {
  id: string;
  workflowRunId: string;
  stepRunId: string;
  sequence: number;
  executorBinding: WorkflowExecutorBinding;
  sessionId: string | null;
  runtimeIdentity: WorkflowAttemptRuntimeIdentity;
  status: WorkflowAttemptStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkflowSuspensionRecord {
  id: string;
  workflowRunId: string;
  stepRunId: string;
  attemptId: string | null;
  reason: WorkflowSuspensionReason;
  message: string | null;
  continuation: Record<string, unknown> | null;
  status: WorkflowSuspensionStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface WorkflowArtifactRecord {
  id: string;
  workflowRunId: string;
  producerAttemptId: string | null;
  schemaId: WorkflowArtifactSchemaId;
  content: WorkflowArtifactContent;
  contentHash: string;
  baselineCommit: string | null;
  createdAt: string;
}

export interface WorkflowGateDecisionRecord {
  id: string;
  workflowRunId: string;
  stepRunId: string;
  decision: "approved" | "rejected";
  actor: "user" | "policy";
  reason: string | null;
  createdAt: string;
}

export interface WorkflowActionRecord {
  id: string;
  workflowRunId: string;
  stepRunId: string;
  type: WorkflowActionType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status: WorkflowActionStatus;
  attemptCount: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  result: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAggregate {
  run: WorkflowRunRecord;
  steps: WorkflowStepRunRecord[];
  attempts: WorkflowAttemptRecord[];
  artifacts: WorkflowArtifactRecord[];
  gateDecisions: WorkflowGateDecisionRecord[];
  suspensions: WorkflowSuspensionRecord[];
  actions: WorkflowActionRecord[];
}

export interface CreateWorkflowPayload {
  workspaceId: string;
  workspaceRootPath: string;
  prompt: string;
  bindings: WorkflowExecutorBindings;
}

export interface WorkflowTransitionContext {
  now: string;
  createId(): string;
}

export type WorkflowCommand =
  | { type: "start" }
  | {
      type: "begin_attempt";
      stepId: string;
      sessionId?: string;
      runtimeIdentity?: WorkflowAttemptRuntimeIdentity;
    }
  | {
      type: "checkpoint_attempt";
      attemptId: string;
      sessionId?: string;
      runtimeIdentity: WorkflowAttemptRuntimeIdentity;
    }
  | {
      type: "open_suspension";
      stepId: string;
      reason: WorkflowSuspensionReason;
      message?: string;
      continuation?: Record<string, unknown>;
    }
  | {
      type: "complete_step";
      stepId: string;
      outcome: WorkflowTransitionOutcome;
      artifact?: WorkflowArtifactInput;
    }
  | {
      type: "decide_gate";
      stepId: string;
      decision: "approved" | "rejected";
      actor: "user" | "policy";
      reason?: string;
    }
  | { type: "fail_step"; stepId: string; error: string }
  | { type: "cancel" };

export interface WorkflowTransitionResult {
  aggregate: WorkflowAggregate;
  newActionIds: string[];
}
