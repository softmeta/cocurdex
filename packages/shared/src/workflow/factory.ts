import { assertValidWorkflowDefinition } from "./definition-validation";
import { WorkflowTransitionError } from "./errors";
import {
  PLAN_EXECUTE_REVIEW_DEFINITION,
  validatePlanExecuteReviewBindings,
} from "./template";
import type {
  CreateWorkflowPayload,
  WorkflowAggregate,
  WorkflowDefinitionRevision,
  WorkflowTransitionContext,
} from "./types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createWorkflowFromDefinition(
  payload: CreateWorkflowPayload,
  definition: WorkflowDefinitionRevision,
  context: WorkflowTransitionContext,
): WorkflowAggregate {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new WorkflowTransitionError("Workflow prompt must not be empty.");
  }
  if (!payload.bindings) {
    throw new WorkflowTransitionError(
      "Workflow executor bindings are required.",
    );
  }
  validatePlanExecuteReviewBindings(payload.bindings);
  assertValidWorkflowDefinition(definition);

  const frozenDefinition = clone(definition);
  const runId = context.createId();
  return {
    run: {
      id: runId,
      workspaceId: payload.workspaceId,
      workspaceRootPath: payload.workspaceRootPath,
      rootPrompt: prompt,
      definitionId: frozenDefinition.definitionId,
      definitionVersion: frozenDefinition.version,
      frozenDefinition,
      frozenBindings: clone(payload.bindings),
      status: "created",
      currentStepId: null,
      revision: 0,
      transitionCounts: {},
      createdAt: context.now,
      updatedAt: context.now,
      completedAt: null,
    },
    steps: frozenDefinition.steps.map((step) => ({
      id: context.createId(),
      workflowRunId: runId,
      stepId: step.id,
      kind: step.kind,
      role: step.role ?? null,
      status: "pending",
      attemptCount: 0,
      createdAt: context.now,
      updatedAt: context.now,
      completedAt: null,
    })),
    attempts: [],
    artifacts: [],
    gateDecisions: [],
    suspensions: [],
    actions: [],
  };
}

export function createPlanExecuteReviewWorkflow(
  payload: CreateWorkflowPayload,
  context: WorkflowTransitionContext,
): WorkflowAggregate {
  return createWorkflowFromDefinition(
    payload,
    PLAN_EXECUTE_REVIEW_DEFINITION,
    context,
  );
}
