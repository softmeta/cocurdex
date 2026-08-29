import { validateWorkflowArtifact } from "./artifact-contracts";
import { WorkflowTransitionError } from "./errors";
import {
  applyWorkflowStepOutcome,
  cloneWorkflowValue,
  ensureCurrentWorkflowStep,
  findWorkflowStepDefinition,
  finishWorkflowRun,
  isTerminalWorkflowStatus,
  scheduleInitialWorkflowStep,
} from "./state-machine-support";
import type {
  WorkflowAggregate,
  WorkflowCommand,
  WorkflowTransitionContext,
  WorkflowTransitionResult,
} from "./types";

export { createPlanExecuteReviewWorkflow } from "./factory";

export function transitionWorkflow(
  current: WorkflowAggregate,
  command: WorkflowCommand,
  context: WorkflowTransitionContext,
): WorkflowTransitionResult {
  const aggregate = cloneWorkflowValue(current);
  const newActionIds: string[] = [];

  if (isTerminalWorkflowStatus(aggregate.run.status)) {
    throw new WorkflowTransitionError(
      `Cannot apply '${command.type}' to terminal workflow '${aggregate.run.status}'.`,
    );
  }

  if (command.type === "start") {
    if (aggregate.run.status !== "created") {
      throw new WorkflowTransitionError(
        `Cannot start a workflow in '${aggregate.run.status}' status.`,
      );
    }
    aggregate.run.revision += 1;
    aggregate.run.updatedAt = context.now;
    newActionIds.push(scheduleInitialWorkflowStep(aggregate, "plan", context));
    return { aggregate, newActionIds };
  }

  if (command.type === "begin_attempt") {
    const step = ensureCurrentWorkflowStep(aggregate, command.stepId);
    const definition = findWorkflowStepDefinition(aggregate, command.stepId);
    if (definition.kind !== "agent" || !definition.role) {
      throw new WorkflowTransitionError(
        `Step '${command.stepId}' is not agent-backed.`,
      );
    }
    if (step.status !== "ready") {
      throw new WorkflowTransitionError(
        `Cannot begin an attempt for step '${command.stepId}' in '${step.status}' status.`,
      );
    }
    if (step.attemptCount >= definition.maxAttempts) {
      finishWorkflowRun(aggregate, "exhausted", context);
      return { aggregate, newActionIds };
    }

    step.attemptCount += 1;
    step.status = "running";
    step.updatedAt = context.now;
    aggregate.attempts.push({
      id: context.createId(),
      workflowRunId: aggregate.run.id,
      stepRunId: step.id,
      sequence: step.attemptCount,
      executorBinding: {
        ...cloneWorkflowValue(aggregate.run.frozenBindings[definition.role]),
        permissionProfile: definition.permissionProfile,
      },
      sessionId: command.sessionId ?? null,
      runtimeIdentity: command.runtimeIdentity ?? {
        adapterId: aggregate.run.frozenBindings[definition.role].agentId,
        providerSessionId: null,
        providerOperationId: null,
        resumeToken: null,
      },
      status: "running",
      error: null,
      createdAt: context.now,
      updatedAt: context.now,
      completedAt: null,
    });
    aggregate.run.revision += 1;
    aggregate.run.updatedAt = context.now;
    return { aggregate, newActionIds };
  }

  if (command.type === "checkpoint_attempt") {
    const attempt = aggregate.attempts.find(
      (candidate) => candidate.id === command.attemptId,
    );
    if (attempt?.status !== "running") {
      throw new WorkflowTransitionError(
        `Agent Attempt '${command.attemptId}' is not running.`,
      );
    }
    attempt.sessionId = command.sessionId ?? attempt.sessionId;
    attempt.runtimeIdentity = cloneWorkflowValue(command.runtimeIdentity);
    attempt.updatedAt = context.now;
    aggregate.run.revision += 1;
    aggregate.run.updatedAt = context.now;
    return { aggregate, newActionIds };
  }

  if (command.type === "open_suspension") {
    const step = ensureCurrentWorkflowStep(aggregate, command.stepId);
    const existing = aggregate.suspensions.find(
      (suspension) =>
        suspension.stepRunId === step.id && suspension.status === "active",
    );
    if (existing) {
      return { aggregate, newActionIds };
    }
    const runningAttempt = aggregate.attempts
      .filter(
        (attempt) =>
          attempt.stepRunId === step.id && attempt.status === "running",
      )
      .at(-1);
    aggregate.suspensions.push({
      id: context.createId(),
      workflowRunId: aggregate.run.id,
      stepRunId: step.id,
      attemptId: runningAttempt?.id ?? null,
      reason: command.reason,
      message: command.message ?? null,
      continuation: command.continuation
        ? cloneWorkflowValue(command.continuation)
        : null,
      status: "active",
      createdAt: context.now,
      resolvedAt: null,
    });
    aggregate.run.revision += 1;
    aggregate.run.updatedAt = context.now;
    return { aggregate, newActionIds };
  }

  if (command.type === "complete_step") {
    const step = ensureCurrentWorkflowStep(aggregate, command.stepId);
    const definition = findWorkflowStepDefinition(aggregate, command.stepId);
    const allowedStatuses =
      definition.kind === "validation" ? ["ready", "running"] : ["running"];
    if (!allowedStatuses.includes(step.status)) {
      throw new WorkflowTransitionError(
        `Cannot complete step '${command.stepId}' in '${step.status}' status.`,
      );
    }
    if (definition.outputSchema) {
      if (!command.artifact) {
        throw new WorkflowTransitionError(
          `Step '${command.stepId}' requires artifact '${definition.outputSchema}'.`,
        );
      }
      if (command.artifact.schemaId !== definition.outputSchema) {
        throw new WorkflowTransitionError(
          `Step '${command.stepId}' produced '${command.artifact.schemaId}', expected '${definition.outputSchema}'.`,
        );
      }
      validateWorkflowArtifact(command.artifact, command.outcome);
    }

    const runningAttempt = aggregate.attempts
      .filter(
        (attempt) =>
          attempt.stepRunId === step.id && attempt.status === "running",
      )
      .at(-1);
    if (definition.kind === "agent" && !runningAttempt) {
      throw new WorkflowTransitionError(
        `Step '${command.stepId}' has no running Agent Attempt.`,
      );
    }
    if (runningAttempt) {
      runningAttempt.status = "completed";
      runningAttempt.updatedAt = context.now;
      runningAttempt.completedAt = context.now;
    }
    if (command.artifact) {
      aggregate.artifacts.push({
        id: context.createId(),
        workflowRunId: aggregate.run.id,
        producerAttemptId: runningAttempt?.id ?? null,
        schemaId: command.artifact.schemaId,
        content: cloneWorkflowValue(command.artifact.content),
        contentHash: command.artifact.contentHash,
        baselineCommit: command.artifact.baselineCommit ?? null,
        createdAt: context.now,
      });
    }
    step.status = "completed";
    step.updatedAt = context.now;
    step.completedAt = context.now;
    aggregate.run.revision += 1;
    aggregate.run.updatedAt = context.now;
    applyWorkflowStepOutcome(
      aggregate,
      command.stepId,
      command.outcome,
      context,
      newActionIds,
    );
    return { aggregate, newActionIds };
  }

  if (command.type === "decide_gate") {
    const step = ensureCurrentWorkflowStep(aggregate, command.stepId);
    if (step.kind !== "gate" || step.status !== "awaiting_gate") {
      throw new WorkflowTransitionError(
        `Step '${command.stepId}' is not awaiting a Gate Decision.`,
      );
    }
    aggregate.gateDecisions.push({
      id: context.createId(),
      workflowRunId: aggregate.run.id,
      stepRunId: step.id,
      decision: command.decision,
      actor: command.actor,
      reason: command.reason ?? null,
      createdAt: context.now,
    });
    for (const suspension of aggregate.suspensions) {
      if (suspension.stepRunId === step.id && suspension.status === "active") {
        suspension.status = "resolved";
        suspension.resolvedAt = context.now;
      }
    }
    step.status = "completed";
    step.updatedAt = context.now;
    step.completedAt = context.now;
    aggregate.run.revision += 1;
    aggregate.run.updatedAt = context.now;
    applyWorkflowStepOutcome(
      aggregate,
      command.stepId,
      command.decision,
      context,
      newActionIds,
    );
    return { aggregate, newActionIds };
  }

  if (command.type === "fail_step") {
    const step = ensureCurrentWorkflowStep(aggregate, command.stepId);
    const runningAttempt = aggregate.attempts
      .filter(
        (attempt) =>
          attempt.stepRunId === step.id && attempt.status === "running",
      )
      .at(-1);
    if (runningAttempt) {
      runningAttempt.status = "failed";
      runningAttempt.error = command.error;
      runningAttempt.updatedAt = context.now;
      runningAttempt.completedAt = context.now;
    }
    step.status = "failed";
    step.updatedAt = context.now;
    step.completedAt = context.now;
    aggregate.run.revision += 1;
    finishWorkflowRun(aggregate, "failed", context);
    return { aggregate, newActionIds };
  }

  aggregate.run.revision += 1;
  for (const step of aggregate.steps) {
    if (step.status !== "completed" && step.status !== "failed") {
      step.status = "cancelled";
      step.updatedAt = context.now;
      step.completedAt = context.now;
    }
  }
  for (const attempt of aggregate.attempts) {
    if (attempt.status === "queued" || attempt.status === "running") {
      attempt.status = "cancelled";
      attempt.updatedAt = context.now;
      attempt.completedAt = context.now;
    }
  }
  for (const suspension of aggregate.suspensions) {
    if (suspension.status === "active") {
      suspension.status = "cancelled";
      suspension.resolvedAt = context.now;
    }
  }
  finishWorkflowRun(aggregate, "cancelled", context);
  return { aggregate, newActionIds };
}
