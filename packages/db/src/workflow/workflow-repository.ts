import type {
  WorkflowActionRecord,
  WorkflowAggregate,
  WorkflowDefinitionRecord,
  WorkflowRunRecord,
} from "@cocurdex/shared";

export class WorkflowRevisionConflictError extends Error {}

export interface ClaimWorkflowActionInput {
  workerId: string;
  now: string;
  leaseExpiresAt: string;
}

export interface RenewWorkflowActionLeaseInput {
  actionId: string;
  workerId: string;
  now: string;
  leaseExpiresAt: string;
}

export interface SettleWorkflowActionInput {
  actionId: string;
  workerId: string;
  aggregate: WorkflowAggregate;
  expectedRevision: number;
  status: "completed" | "failed";
  result?: unknown;
  error?: string;
  settledAt: string;
}

export interface WorkflowRepository {
  listRuns(): Promise<WorkflowRunRecord[]>;
  get(runId: string): Promise<WorkflowAggregate | null>;
  listDefinitions(): Promise<WorkflowDefinitionRecord[]>;
  getDefinition(id: string): Promise<WorkflowDefinitionRecord | null>;
  putDefinition(record: WorkflowDefinitionRecord): Promise<void>;
  deleteDefinition(id: string): Promise<void>;
  create(aggregate: WorkflowAggregate): Promise<void>;
  commit(aggregate: WorkflowAggregate, expectedRevision: number): Promise<void>;
  claimNextAction(
    input: ClaimWorkflowActionInput,
  ): Promise<WorkflowActionRecord | null>;
  renewActionLease(
    input: RenewWorkflowActionLeaseInput,
  ): Promise<WorkflowActionRecord | null>;
  settleAction(
    input: SettleWorkflowActionInput,
  ): Promise<WorkflowActionRecord | null>;
}
