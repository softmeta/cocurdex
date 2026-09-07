import type {
  WorkflowArtifactSchemaId,
  WorkflowCanvasLayout,
  WorkflowDefinitionRevision,
  WorkflowPermissionProfile,
  WorkflowRunStatus,
  WorkflowStepDefinition,
  WorkflowStepKind,
  WorkflowTransitionOutcome,
} from "./types";

export const WORKFLOW_TERMINAL_STATUSES = [
  "completed",
  "failed",
  "cancelled",
  "blocked",
  "exhausted",
] as const;

export const WORKFLOW_ARTIFACT_OUTCOMES: Record<
  WorkflowArtifactSchemaId,
  WorkflowTransitionOutcome[]
> = {
  "plan_artifact.v1": ["completed"],
  "change_set.v1": ["completed"],
  "validation_report.v1": ["passed", "failed"],
  "review_decision.v1": ["accepted", "changes_requested", "blocked"],
};

export const WORKFLOW_GATE_OUTCOMES: WorkflowTransitionOutcome[] = [
  "approved",
  "rejected",
];

const STEP_ID_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export function isWorkflowStepId(value: string): boolean {
  return STEP_ID_PATTERN.test(value);
}

export function workflowTerminalNodeId(status: WorkflowRunStatus): string {
  return `terminal:${status}`;
}

export type WorkflowTerminalStatus =
  (typeof WORKFLOW_TERMINAL_STATUSES)[number];

export function parseWorkflowTerminalNodeId(
  nodeId: string,
): WorkflowTerminalStatus | null {
  const prefix = "terminal:";
  if (!nodeId.startsWith(prefix)) {
    return null;
  }
  const status = nodeId.slice(prefix.length) as WorkflowTerminalStatus;
  return (WORKFLOW_TERMINAL_STATUSES as readonly string[]).includes(status)
    ? status
    : null;
}

export function isWorkflowTerminalStatus(
  status: WorkflowRunStatus,
): status is WorkflowTerminalStatus {
  return (WORKFLOW_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function outcomesForWorkflowStep(
  step: WorkflowStepDefinition,
): WorkflowTransitionOutcome[] {
  if (step.kind === "gate") {
    return [...WORKFLOW_GATE_OUTCOMES];
  }
  if (step.outputSchema) {
    return [...WORKFLOW_ARTIFACT_OUTCOMES[step.outputSchema]];
  }
  return ["completed"];
}

export function permissionProfileForWorkflowStep(
  step: Pick<WorkflowStepDefinition, "kind" | "role" | "outputSchema">,
): WorkflowPermissionProfile {
  if (step.kind === "gate") {
    return "read_only";
  }
  if (step.outputSchema === "validation_report.v1") {
    return "validation";
  }
  if (step.role === "implementer") {
    return "workspace_write";
  }
  return "read_only";
}

export function createWorkflowStepId(
  kind: WorkflowStepKind,
  existingIds: string[],
): string {
  const prefix = kind === "gate" ? "gate" : "step";
  const used = new Set(existingIds);
  let index = 1;
  while (used.has(`${prefix}_${index}`)) {
    index += 1;
  }
  return `${prefix}_${index}`;
}

export function defaultWorkflowCanvasLayout(
  definition: WorkflowDefinitionRevision,
): WorkflowCanvasLayout {
  const nodes: Record<string, { x: number; y: number }> = {};
  const visited = new Set<string>();
  const queue: string[] = [definition.initialStepId];
  const depth = new Map<string, number>();
  const laneAtDepth = new Map<number, number>();
  depth.set(definition.initialStepId, 0);

  while (queue.length > 0) {
    const stepId = queue.shift();
    if (!stepId || visited.has(stepId)) {
      continue;
    }
    visited.add(stepId);
    const currentDepth = depth.get(stepId) ?? 0;
    const lane = laneAtDepth.get(currentDepth) ?? 0;
    laneAtDepth.set(currentDepth, lane + 1);
    nodes[stepId] = { x: currentDepth * 280, y: lane * 140 };

    for (const transition of definition.transitions) {
      if (transition.from !== stepId) {
        continue;
      }
      if (transition.to && !depth.has(transition.to)) {
        depth.set(transition.to, currentDepth + 1);
        queue.push(transition.to);
      }
      if (transition.terminalStatus) {
        const terminalId = workflowTerminalNodeId(transition.terminalStatus);
        if (!nodes[terminalId]) {
          const terminalLane = laneAtDepth.get(currentDepth + 1) ?? 0;
          laneAtDepth.set(currentDepth + 1, terminalLane + 1);
          nodes[terminalId] = {
            x: (currentDepth + 1) * 280,
            y: terminalLane * 140,
          };
        }
      }
    }
  }

  for (const step of definition.steps) {
    if (!nodes[step.id]) {
      const extras = Object.keys(nodes).length;
      nodes[step.id] = { x: 0, y: extras * 140 };
    }
  }

  return { nodes };
}
