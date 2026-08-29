import { WorkflowTransitionError } from "./errors";
import type {
  WorkflowActionRecord,
  WorkflowAggregate,
  WorkflowCommand,
  WorkflowRunStatus,
  WorkflowStepDefinition,
  WorkflowStepRunRecord,
  WorkflowTransitionContext,
} from "./types";

export function cloneWorkflowValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function findWorkflowStep(
  aggregate: WorkflowAggregate,
  stepId: string,
): WorkflowStepRunRecord {
  const step = aggregate.steps.find((candidate) => candidate.stepId === stepId);
  if (!step) {
    throw new WorkflowTransitionError(`Unknown workflow step '${stepId}'.`);
  }
  return step;
}

export function findWorkflowStepDefinition(
  aggregate: WorkflowAggregate,
  stepId: string,
): WorkflowStepDefinition {
  const step = aggregate.run.frozenDefinition.steps.find(
    (candidate) => candidate.id === stepId,
  );
  if (!step) {
    throw new WorkflowTransitionError(`Unknown workflow step '${stepId}'.`);
  }
  return step;
}

function scheduleStep(
  aggregate: WorkflowAggregate,
  stepId: string,
  context: WorkflowTransitionContext,
): string {
  const step = findWorkflowStep(aggregate, stepId);
  const definition = findWorkflowStepDefinition(aggregate, stepId);
  let actionType: WorkflowActionRecord["type"] = "execute_validation_step";
  if (definition.kind === "agent") {
    actionType = "execute_agent_step";
  } else if (definition.kind === "gate") {
    actionType = "request_gate_decision";
  }

  step.status = definition.kind === "gate" ? "awaiting_gate" : "ready";
  step.updatedAt = context.now;
  aggregate.run.currentStepId = stepId;
  aggregate.run.status =
    definition.kind === "gate" ? "awaiting_gate" : "running";

  const action: WorkflowActionRecord = {
    id: context.createId(),
    workflowRunId: aggregate.run.id,
    stepRunId: step.id,
    type: actionType,
    idempotencyKey: `${aggregate.run.id}:${aggregate.run.revision}:${stepId}:${actionType}`,
    payload: {
      stepId,
      ...(definition.role ? { role: definition.role } : {}),
    },
    status: "pending",
    attemptCount: 0,
    availableAt: context.now,
    leaseOwner: null,
    leaseExpiresAt: null,
    result: null,
    error: null,
    createdAt: context.now,
    updatedAt: context.now,
  };
  aggregate.actions.push(action);
  return action.id;
}

export function isTerminalWorkflowStatus(status: WorkflowRunStatus): boolean {
  return ["completed", "failed", "cancelled", "exhausted"].includes(status);
}

export function finishWorkflowRun(
  aggregate: WorkflowAggregate,
  status: WorkflowRunStatus,
  context: WorkflowTransitionContext,
): void {
  for (const action of aggregate.actions) {
    if (action.status === "pending" || action.status === "claimed") {
      action.status = "cancelled";
      action.leaseOwner = null;
      action.leaseExpiresAt = null;
      action.error = `Workflow ended with status '${status}'.`;
      action.updatedAt = context.now;
    }
  }
  aggregate.run.status = status;
  aggregate.run.currentStepId = null;
  aggregate.run.completedAt = context.now;
  aggregate.run.updatedAt = context.now;
}

export function applyWorkflowStepOutcome(
  aggregate: WorkflowAggregate,
  stepId: string,
  outcome: Extract<WorkflowCommand, { type: "complete_step" }>["outcome"],
  context: WorkflowTransitionContext,
  newActionIds: string[],
): void {
  const transition = aggregate.run.frozenDefinition.transitions.find(
    (candidate) => candidate.from === stepId && candidate.outcome === outcome,
  );
  if (!transition) {
    throw new WorkflowTransitionError(
      `Step '${stepId}' does not support outcome '${outcome}'.`,
    );
  }

  const transitionKey = `${transition.from}:${transition.outcome}:${transition.to ?? transition.terminalStatus}`;
  const traversals = (aggregate.run.transitionCounts[transitionKey] ?? 0) + 1;
  aggregate.run.transitionCounts[transitionKey] = traversals;
  if (
    transition.maxTraversals !== undefined &&
    traversals > transition.maxTraversals
  ) {
    finishWorkflowRun(aggregate, "exhausted", context);
    return;
  }

  if (transition.terminalStatus) {
    finishWorkflowRun(aggregate, transition.terminalStatus, context);
    return;
  }
  if (!transition.to) {
    throw new WorkflowTransitionError(
      `Transition from '${stepId}' has no target or terminal status.`,
    );
  }
  newActionIds.push(scheduleStep(aggregate, transition.to, context));
}

export function ensureCurrentWorkflowStep(
  aggregate: WorkflowAggregate,
  stepId: string,
): WorkflowStepRunRecord {
  if (aggregate.run.currentStepId !== stepId) {
    throw new WorkflowTransitionError(
      `Workflow is not currently executing step '${stepId}'.`,
    );
  }
  return findWorkflowStep(aggregate, stepId);
}

export function scheduleInitialWorkflowStep(
  aggregate: WorkflowAggregate,
  stepId: string,
  context: WorkflowTransitionContext,
): string {
  return scheduleStep(aggregate, stepId, context);
}
