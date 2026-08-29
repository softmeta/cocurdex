import type { WorkflowRepository } from "@cocurdex/db";
import {
  transitionWorkflow,
  type WorkflowActionRecord,
  type WorkflowAggregate,
  type WorkflowAttemptRecord,
  type WorkflowAttemptRuntimeIdentity,
  type WorkflowCommand,
} from "@cocurdex/shared";

type WorkflowExecutionCommand = Extract<
  WorkflowCommand,
  { type: "complete_step" | "fail_step" }
>;

export interface WorkflowActionExecutionContext {
  action: WorkflowActionRecord;
  aggregate: WorkflowAggregate;
  attempt: WorkflowAttemptRecord | null;
  signal: AbortSignal;
  checkpointAttempt(
    runtimeIdentity: WorkflowAttemptRuntimeIdentity,
    sessionId?: string,
  ): Promise<void>;
  renewLease(): Promise<void>;
}

export interface WorkflowActionExecutionResult {
  command: WorkflowExecutionCommand;
  result?: unknown;
}

export interface WorkflowActionExecutor {
  execute(
    context: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecutionResult>;
}

export interface WorkflowWorkerOptions {
  workerId: string;
  leaseDurationMs: number;
  now(): string;
  createId(): string;
}

export type WorkflowWorkerResult =
  | { status: "idle" }
  | {
      status: "completed" | "failed" | "suspended" | "cancelled";
      workflowRunId: string;
      actionId: string;
      actionType: WorkflowActionRecord["type"];
      error?: string;
    };

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown workflow error";
}

function findStepId(
  aggregate: WorkflowAggregate,
  action: WorkflowActionRecord,
): string {
  const step = aggregate.steps.find(
    (candidate) => candidate.id === action.stepRunId,
  );
  if (!step) {
    throw new Error(`Workflow action '${action.id}' has no Step Run.`);
  }
  return step.stepId;
}

function findRunningAttempt(
  aggregate: WorkflowAggregate,
  stepRunId: string,
): WorkflowAttemptRecord | null {
  return (
    aggregate.attempts
      .filter(
        (attempt) =>
          attempt.stepRunId === stepRunId && attempt.status === "running",
      )
      .at(-1) ?? null
  );
}

export class WorkflowWorker {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly executor: WorkflowActionExecutor,
    private readonly options: WorkflowWorkerOptions,
  ) {}

  async runNext(): Promise<WorkflowWorkerResult> {
    const claimedAt = this.options.now();
    const action = await this.repository.claimNextAction({
      workerId: this.options.workerId,
      now: claimedAt,
      leaseExpiresAt: addMilliseconds(claimedAt, this.options.leaseDurationMs),
    });
    if (!action) return { status: "idle" };

    try {
      if (action.type === "request_gate_decision") {
        return await this.openGateSuspension(action);
      }
      return await this.executeAction(action);
    } catch (error) {
      return this.failAction(action, errorMessage(error));
    }
  }

  private async openGateSuspension(
    action: WorkflowActionRecord,
  ): Promise<WorkflowWorkerResult> {
    const current = await this.requireAggregate(action.workflowRunId);
    const stepId = findStepId(current, action);
    const next = transitionWorkflow(
      current,
      {
        type: "open_suspension",
        stepId,
        reason: "approval_required",
        message: `Approval is required before '${stepId}' can continue.`,
        continuation: { actionId: action.id },
      },
      this.context(),
    ).aggregate;
    await this.settle(action, current, next, "completed", {
      suspensionId: next.suspensions.at(-1)?.id ?? null,
    });
    return this.result(action, "suspended");
  }

  private async executeAction(
    action: WorkflowActionRecord,
  ): Promise<WorkflowWorkerResult> {
    let aggregate = await this.requireAggregate(action.workflowRunId);
    const stepId = findStepId(aggregate, action);
    let attempt = findRunningAttempt(aggregate, action.stepRunId);

    if (action.type === "execute_agent_step" && !attempt) {
      const begun = transitionWorkflow(
        aggregate,
        { type: "begin_attempt", stepId },
        this.context(),
      ).aggregate;
      await this.repository.commit(begun, aggregate.run.revision);
      aggregate = begun;
      attempt = findRunningAttempt(aggregate, action.stepRunId);
    }
    if (action.type === "execute_agent_step" && !attempt) {
      throw new Error(`Agent step '${stepId}' has no resumable attempt.`);
    }

    const execution = await this.withLeaseHeartbeat(action, (signal) =>
      this.executor.execute({
        action,
        aggregate,
        attempt,
        signal,
        checkpointAttempt: async (runtimeIdentity, sessionId) => {
          if (!attempt) {
            throw new Error(`Action '${action.id}' is not agent-backed.`);
          }
          const current = await this.requireAggregate(action.workflowRunId);
          const checkpointed = transitionWorkflow(
            current,
            {
              type: "checkpoint_attempt",
              attemptId: attempt.id,
              runtimeIdentity,
              sessionId,
            },
            this.context(),
          ).aggregate;
          await this.repository.commit(checkpointed, current.run.revision);
        },
        renewLease: () => this.renewLease(action),
      }),
    );

    const current = await this.requireAggregate(action.workflowRunId);
    const next = transitionWorkflow(
      current,
      execution.command,
      this.context(),
    ).aggregate;
    const status =
      execution.command.type === "fail_step" ? "failed" : "completed";
    await this.settle(
      action,
      current,
      next,
      status,
      execution.result,
      execution.command.type === "fail_step"
        ? execution.command.error
        : undefined,
    );
    return this.result(action, status);
  }

  private async failAction(
    action: WorkflowActionRecord,
    message: string,
  ): Promise<WorkflowWorkerResult> {
    const current = await this.requireAggregate(action.workflowRunId);
    if (current.run.status === "cancelled") {
      return this.result(action, "cancelled");
    }
    if (
      current.run.status === "completed" ||
      current.run.status === "failed" ||
      current.run.status === "exhausted"
    ) {
      return this.result(action, "failed");
    }
    const stepId = findStepId(current, action);
    const next = transitionWorkflow(
      current,
      { type: "fail_step", stepId, error: message },
      this.context(),
    ).aggregate;
    await this.settle(action, current, next, "failed", undefined, message);
    return { ...this.result(action, "failed"), error: message };
  }

  private async renewLease(action: WorkflowActionRecord): Promise<void> {
    const now = this.options.now();
    const renewed = await this.repository.renewActionLease({
      actionId: action.id,
      workerId: this.options.workerId,
      now,
      leaseExpiresAt: addMilliseconds(now, this.options.leaseDurationMs),
    });
    if (!renewed) {
      throw new Error(`Workflow action lease '${action.id}' was lost.`);
    }
  }

  private async withLeaseHeartbeat<T>(
    action: WorkflowActionRecord,
    execute: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let renewalError: Error | null = null;
    const interval = setInterval(
      () => {
        void this.renewLease(action).catch((error: unknown) => {
          renewalError = new Error(errorMessage(error));
          controller.abort(renewalError);
        });
      },
      Math.max(1_000, Math.floor(this.options.leaseDurationMs / 3)),
    );
    interval.unref();
    try {
      const result = await execute(controller.signal);
      if (renewalError) throw renewalError;
      return result;
    } finally {
      clearInterval(interval);
    }
  }

  private async settle(
    action: WorkflowActionRecord,
    current: WorkflowAggregate,
    next: WorkflowAggregate,
    status: "completed" | "failed",
    result?: unknown,
    error?: string,
  ): Promise<void> {
    const settled = await this.repository.settleAction({
      actionId: action.id,
      workerId: this.options.workerId,
      aggregate: next,
      expectedRevision: current.run.revision,
      status,
      result,
      error,
      settledAt: this.options.now(),
    });
    if (!settled) {
      throw new Error(`Workflow action lease '${action.id}' was lost.`);
    }
  }

  private async requireAggregate(runId: string): Promise<WorkflowAggregate> {
    const aggregate = await this.repository.get(runId);
    if (!aggregate) throw new Error(`Workflow run '${runId}' was not found.`);
    return aggregate;
  }

  private context() {
    return { now: this.options.now(), createId: this.options.createId };
  }

  private result(
    action: WorkflowActionRecord,
    status: "completed" | "failed" | "suspended" | "cancelled",
  ): Exclude<WorkflowWorkerResult, { status: "idle" }> {
    return {
      status,
      workflowRunId: action.workflowRunId,
      actionId: action.id,
      actionType: action.type,
    };
  }
}
