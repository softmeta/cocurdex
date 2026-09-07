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
  type OnEdgesChange,
  type OnNodesChange,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useResolvedTheme } from "@/lib";
import {
  isWorkflowOutcomeHandle,
  layoutFromFlowNodes,
  type WorkflowFlowNode,
  workflowDefinitionToFlow,
} from "./workflow-definition-graph";
import type { WorkflowInspectorSelection } from "./workflow-inspector";
import { WorkflowStepNode, WorkflowTerminalNode } from "./workflow-node";

import "@xyflow/react/dist/style.css";

const nodeTypes = {
  workflowStep: WorkflowStepNode,
  workflowTerminal: WorkflowTerminalNode,
};

function selectNodes(
  nodes: WorkflowFlowNode[],
  selection: WorkflowInspectorSelection,
): WorkflowFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    selected: selection?.type === "step" && selection.id === node.id,
  }));
}

function selectEdges(
  edges: Edge[],
  selection: WorkflowInspectorSelection,
): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    selected:
      selection?.type === "edge" &&
      edge.id === `${selection.from}:${selection.outcome}`,
  }));
}

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
  const colorMode = useResolvedTheme() === "light" ? "light" : "dark";
  const graph = useMemo(() => {
    const projected = workflowDefinitionToFlow(definition, layout);
    return {
      nodes: selectNodes(projected.nodes, selection),
      edges: selectEdges(projected.edges, selection),
    };
  }, [definition, layout, selection]);
  const [nodes, setNodes] = useState(graph.nodes);
  const [edges, setEdges] = useState(graph.edges);
  const [synced, setSynced] = useState({ definition, layout, selection });
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  if (definition !== synced.definition || layout !== synced.layout) {
    setSynced({ definition, layout, selection });
    setNodes(graph.nodes);
    setEdges(graph.edges);
    nodesRef.current = graph.nodes;
  } else if (selection !== synced.selection) {
    setSynced({ definition, layout, selection });
    setNodes((current) => selectNodes(current, selection));
    setEdges((current) => selectEdges(current, selection));
  }

  const onNodesChange = useCallback<OnNodesChange>(
    (changes) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current) as WorkflowFlowNode[];
        nodesRef.current = next;
        return next;
      });
      const removed = changes.find((change) => change.type === "remove");
      if (removed && removed.type === "remove" && !disabled) {
        if (!parseWorkflowTerminalNodeId(removed.id)) {
          onDefinitionChange(removeWorkflowStep(definition, removed.id));
        }
      }
    },
    [definition, disabled, onDefinitionChange],
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
        colorMode={colorMode}
        defaultEdgeOptions={{ type: "smoothstep" }}
        deleteKeyCode={disabled ? null : ["Backspace", "Delete"]}
        edges={edges}
        elementsSelectable
        nodes={nodes}
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
        onNodeDragStop={() => {
          if (!disabled) {
            onLayoutChange(layoutFromFlowNodes(nodesRef.current));
          }
        }}
        onNodesChange={onNodesChange}
        onPaneClick={() => onSelectionChange(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Controls
          className="overflow-hidden rounded-control border border-border shadow-sm"
          showInteractive={false}
        />
        <MiniMap
          bgColor="var(--background)"
          className="overflow-hidden rounded-card border border-border shadow-sm"
          maskColor="color-mix(in oklab, var(--foreground) 18%, transparent)"
          nodeColor="var(--muted-foreground)"
          nodeStrokeColor="var(--border)"
          pannable
          zoomable
        />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
