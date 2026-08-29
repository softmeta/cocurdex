import type {
  WorkflowActionRecord,
  WorkflowAggregate,
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
