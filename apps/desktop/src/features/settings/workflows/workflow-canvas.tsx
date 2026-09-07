import type {
  WorkflowCanvasLayout,
  WorkflowDefinitionRevision,
  WorkflowTransitionOutcome,
} from "@cocurdex/shared";
import {
  connectWorkflowTransition,
  disconnectWorkflowTransition,
  parseWorkflowTerminalNodeId,
  removeWorkflowStep,
  workflowConnectTarget,
} from "@cocurdex/shared";
import {
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useCallback, useMemo } from "react";
import {
  isWorkflowOutcomeHandle,
  layoutFromFlowNodes,
  workflowDefinitionToFlow,
} from "./workflow-definition-graph";
import type { WorkflowInspectorSelection } from "./workflow-inspector";
import { WorkflowStepNode, WorkflowTerminalNode } from "./workflow-node";

import "@xyflow/react/dist/style.css";

const nodeTypes = {
  workflowStep: WorkflowStepNode,
  workflowTerminal: WorkflowTerminalNode,
};

export function WorkflowCanvas({
  definition,
  disabled,
  layout,
  selection,
  onDefinitionChange,
  onLayoutChange,
  onSelectionChange,
}: {
  definition: WorkflowDefinitionRevision;
  disabled: boolean;
  layout: WorkflowCanvasLayout;
  selection: WorkflowInspectorSelection;
  onDefinitionChange(next: WorkflowDefinitionRevision): void;
  onLayoutChange(next: WorkflowCanvasLayout): void;
  onSelectionChange(next: WorkflowInspectorSelection): void;
}) {
  const { nodes, edges } = useMemo(
    () => workflowDefinitionToFlow(definition, layout),
    [definition, layout],
  );

  const selectedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        selected: selection?.type === "step" && selection.id === node.id,
      })),
    [nodes, selection],
  );

  const selectedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        selected:
          selection?.type === "edge" &&
          edge.id === `${selection.from}:${selection.outcome}`,
      })),
    [edges, selection],
  );

  const onNodesChange = useCallback<OnNodesChange>(
    (changes) => {
      const nextNodes = applyNodeChanges(changes, selectedNodes as Node[]);
      if (changes.some((change) => change.type === "position")) {
        onLayoutChange(layoutFromFlowNodes(nextNodes));
      }
      const removed = changes.find((change) => change.type === "remove");
      if (removed && removed.type === "remove" && !disabled) {
        if (!parseWorkflowTerminalNodeId(removed.id)) {
          onDefinitionChange(removeWorkflowStep(definition, removed.id));
        }
      }
    },
    [definition, disabled, onDefinitionChange, onLayoutChange, selectedNodes],
  );

  const onEdgesChange = useCallback<OnEdgesChange>(
    (changes) => {
      if (disabled) {
        return;
      }
      for (const change of changes) {
        if (change.type !== "remove") {
          continue;
        }
        const [from, outcome] = change.id.split(":");
        if (from && outcome) {
          onDefinitionChange(
            disconnectWorkflowTransition(
              definition,
              from,
              outcome as WorkflowTransitionOutcome,
            ),
          );
        }
      }
    },
    [definition, disabled, onDefinitionChange],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (disabled || !connection.source || !connection.target) {
        return;
      }
      const sourceStep = definition.steps.find(
        (step) => step.id === connection.source,
      );
      if (
        !sourceStep ||
        !isWorkflowOutcomeHandle(sourceStep, connection.sourceHandle)
      ) {
        return;
      }
      const target = workflowConnectTarget(connection.target);
      if (!target) {
        return;
      }
      onDefinitionChange(
        connectWorkflowTransition(
          definition,
          connection.source,
          connection.sourceHandle,
          target,
        ),
      );
    },
    [definition, disabled, onDefinitionChange],
  );

  return (
    <ReactFlowProvider>
      <ReactFlow
        className="h-full bg-background"
        defaultEdgeOptions={{ type: "smoothstep" }}
        deleteKeyCode={disabled ? null : ["Backspace", "Delete"]}
        edges={selectedEdges as Edge[]}
        elementsSelectable
        nodes={selectedNodes}
        nodesConnectable={!disabled}
        nodesDraggable={!disabled}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onEdgeClick={(_event, edge) => {
          const [from, outcome] = edge.id.split(":");
          if (from && outcome) {
            onSelectionChange({
              type: "edge",
              from,
              outcome: outcome as WorkflowTransitionOutcome,
            });
          }
        }}
        onNodeClick={(_event, node) => {
          if (parseWorkflowTerminalNodeId(node.id)) {
            onSelectionChange(null);
            return;
          }
          onSelectionChange({ type: "step", id: node.id });
        }}
        onNodesChange={onNodesChange}
        onPaneClick={() => onSelectionChange(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
