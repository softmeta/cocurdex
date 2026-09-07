import {
  createWorkflowStepId,
  parseWorkflowTerminalNodeId,
  permissionProfileForWorkflowStep,
} from "./definition-graph";
import type {
  WorkflowDefinitionRevision,
  WorkflowRunStatus,
  WorkflowStepDefinition,
  WorkflowStepKind,
  WorkflowTransitionDefinition,
  WorkflowTransitionOutcome,
} from "./types";

function cloneDefinition(
  definition: WorkflowDefinitionRevision,
): WorkflowDefinitionRevision {
  return JSON.parse(JSON.stringify(definition)) as WorkflowDefinitionRevision;
}

export function connectWorkflowTransition(
  definition: WorkflowDefinitionRevision,
  from: string,
  outcome: WorkflowTransitionOutcome,
  target:
    | { type: "step"; id: string }
    | { type: "terminal"; status: WorkflowRunStatus },
): WorkflowDefinitionRevision {
  const next = cloneDefinition(definition);
  const transition: WorkflowTransitionDefinition =
    target.type === "step"
      ? { from, outcome, to: target.id }
      : { from, outcome, terminalStatus: target.status };
  next.transitions = [
    ...next.transitions.filter(
      (candidate) =>
        !(candidate.from === from && candidate.outcome === outcome),
    ),
    transition,
  ];
  return next;
}

export function disconnectWorkflowTransition(
  definition: WorkflowDefinitionRevision,
  from: string,
  outcome: WorkflowTransitionOutcome,
): WorkflowDefinitionRevision {
  const next = cloneDefinition(definition);
  next.transitions = next.transitions.filter(
    (candidate) => !(candidate.from === from && candidate.outcome === outcome),
  );
  return next;
}

export function upsertWorkflowStep(
  definition: WorkflowDefinitionRevision,
  step: WorkflowStepDefinition,
): WorkflowDefinitionRevision {
  const next = cloneDefinition(definition);
  const index = next.steps.findIndex((candidate) => candidate.id === step.id);
  const normalized: WorkflowStepDefinition = {
    ...step,
    permissionProfile: permissionProfileForWorkflowStep(step),
  };
  if (index === -1) {
    next.steps = [...next.steps, normalized];
  } else {
    next.steps = next.steps.map((candidate, stepIndex) =>
      stepIndex === index ? normalized : candidate,
    );
  }
  if (!next.initialStepId) {
    next.initialStepId = normalized.id;
  }
  return next;
}

export function removeWorkflowStep(
  definition: WorkflowDefinitionRevision,
  stepId: string,
): WorkflowDefinitionRevision {
  const next = cloneDefinition(definition);
  next.steps = next.steps.filter((step) => step.id !== stepId);
  next.transitions = next.transitions.filter(
    (transition) => transition.from !== stepId && transition.to !== stepId,
  );
  if (next.initialStepId === stepId) {
    next.initialStepId = next.steps[0]?.id ?? "";
  }
  return next;
}

export function createBlankWorkflowStep(
  kind: WorkflowStepKind,
  existingIds: string[],
): WorkflowStepDefinition {
  const id = createWorkflowStepId(kind, existingIds);
  if (kind === "gate") {
    return {
      id,
      kind: "gate",
      permissionProfile: "read_only",
      inputSchemas: [],
      maxAttempts: 1,
    };
  }
  const step: WorkflowStepDefinition = {
    id,
    kind: "agent",
    role: "planner",
    permissionProfile: "read_only",
    instruction: "Complete this step and return the required artifact.",
    inputSchemas: [],
    outputSchema: "plan_artifact.v1",
    maxAttempts: 2,
  };
  return {
    ...step,
    permissionProfile: permissionProfileForWorkflowStep(step),
  };
}

export function workflowConnectTarget(
  nodeId: string,
):
  | { type: "step"; id: string }
  | { type: "terminal"; status: WorkflowRunStatus }
  | null {
  const terminal = parseWorkflowTerminalNodeId(nodeId);
  if (terminal) {
    return { type: "terminal", status: terminal };
  }
  if (nodeId.trim().length === 0) {
    return null;
  }
  return { type: "step", id: nodeId };
}
