import type {
  WorkflowCanvasLayout,
  WorkflowDefinitionRevision,
  WorkflowStepDefinition,
  WorkflowTerminalStatus,
  WorkflowTransitionOutcome,
} from "@cocurdex/shared";
import {
  outcomesForWorkflowStep,
  parseWorkflowTerminalNodeId,
  workflowTerminalNodeId,
} from "@cocurdex/shared";
import type { Edge, Node } from "@xyflow/react";

export type WorkflowFlowStepData = {
  kind: "step";
  step: WorkflowStepDefinition;
};

export type WorkflowFlowTerminalData = {
  kind: "terminal";
  status: WorkflowTerminalStatus;
};

export type WorkflowFlowNode = Node<
  WorkflowFlowStepData | WorkflowFlowTerminalData
>;

export function workflowDefinitionToFlow(
  definition: WorkflowDefinitionRevision,
  layout: WorkflowCanvasLayout,
): { nodes: WorkflowFlowNode[]; edges: Edge[] } {
  const nodes: WorkflowFlowNode[] = definition.steps.map((step, index) => ({
    id: step.id,
    type: "workflowStep",
    position: layout.nodes[step.id] ?? { x: 0, y: index * 140 },
    data: { kind: "step", step },
    sourcePosition: undefined,
    targetPosition: undefined,
  }));

  const terminalIds = new Set<string>();
  for (const transition of definition.transitions) {
    if (!transition.terminalStatus) {
      continue;
    }
    terminalIds.add(workflowTerminalNodeId(transition.terminalStatus));
  }

  for (const nodeId of Object.keys(layout.nodes)) {
    const status = parseWorkflowTerminalNodeId(nodeId);
    if (status) {
      terminalIds.add(nodeId);
    }
  }

  for (const terminalId of terminalIds) {
    const status = parseWorkflowTerminalNodeId(terminalId);
    if (!status) {
      continue;
    }
    nodes.push({
      id: terminalId,
      type: "workflowTerminal",
      position: layout.nodes[terminalId] ?? {
        x: 560,
        y: nodes.length * 80,
      },
      data: { kind: "terminal", status },
    });
  }

  const edges: Edge[] = definition.transitions.flatMap((transition) => {
    const target = transition.to
      ? transition.to
      : transition.terminalStatus
        ? workflowTerminalNodeId(transition.terminalStatus)
        : null;
    if (!target) {
      return [];
    }
    return [
      {
        id: `${transition.from}:${transition.outcome}`,
        source: transition.from,
        sourceHandle: transition.outcome,
        target,
        label: transition.outcome.replaceAll("_", " "),
      },
    ];
  });

  return { nodes, edges };
}

export function layoutFromFlowNodes(
  nodes: Array<Pick<Node, "id" | "position">>,
): WorkflowCanvasLayout {
  const next: WorkflowCanvasLayout = { nodes: {} };
  for (const node of nodes) {
    next.nodes[node.id] = { x: node.position.x, y: node.position.y };
  }
  return next;
}

export function isWorkflowOutcomeHandle(
  step: WorkflowStepDefinition,
  handleId: string | null | undefined,
): handleId is WorkflowTransitionOutcome {
  if (!handleId) {
    return false;
  }
  return outcomesForWorkflowStep(step).includes(
    handleId as WorkflowTransitionOutcome,
  );
}
