import { outcomesForWorkflowStep } from "@cocurdex/shared";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import type {
  WorkflowFlowStepData,
  WorkflowFlowTerminalData,
} from "./workflow-definition-graph";

function handlePosition(source: boolean): Position {
  const rtl = document.documentElement.dir === "rtl";
  if (source) {
    return rtl ? Position.Left : Position.Right;
  }
  return rtl ? Position.Right : Position.Left;
}

type WorkflowStepFlowNode = Node<WorkflowFlowStepData, "workflowStep">;
type WorkflowTerminalFlowNode = Node<
  WorkflowFlowTerminalData,
  "workflowTerminal"
>;

export function WorkflowStepNode({
  data,
  selected,
}: NodeProps<WorkflowStepFlowNode>) {
  const { t } = useTranslation("settings");
  const outcomes = outcomesForWorkflowStep(data.step);
  const kindLabel =
    data.step.kind === "gate"
      ? t("workflows.node.gate")
      : t("workflows.node.agent");

  return (
    <div
      className={cn(
        "min-w-44 rounded-card border bg-card px-3 py-2 shadow-sm",
        selected ? "border-primary" : "border-border",
      )}
    >
      <Handle
        className="size-2! rounded-full border-0 bg-primary"
        position={handlePosition(false)}
        type="target"
      />
      <Text size="meta" tone="muted">
        {kindLabel}
      </Text>
      <Text className="block" weight="medium">
        {data.step.id}
      </Text>
      {data.step.role ? (
        <Text size="meta" tone="muted">
          {t(`workflows.role.${data.step.role}`)}
        </Text>
      ) : null}
      {outcomes.map((outcome, index) => (
        <Handle
          key={outcome}
          className="!size-2 rounded-full border-0 bg-primary"
          id={outcome}
          position={handlePosition(true)}
          style={{ top: 18 + index * 14 }}
          type="source"
        />
      ))}
    </div>
  );
}

export function WorkflowTerminalNode({
  data,
  selected,
}: NodeProps<WorkflowTerminalFlowNode>) {
  const { t } = useTranslation("settings");

  return (
    <div
      className={cn(
        "rounded-full border bg-muted px-3 py-1.5",
        selected ? "border-primary" : "border-border",
      )}
    >
      <Handle
        className="!size-2 rounded-full border-0 bg-muted-foreground"
        position={handlePosition(false)}
        type="target"
      />
      <Text size="meta">{t(`workflows.terminal.${data.status}`)}</Text>
    </div>
  );
}
