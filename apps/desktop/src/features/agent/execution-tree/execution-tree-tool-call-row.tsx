import type {
  AgentToolCallResult,
  ExecutionToolCallNode,
} from "@cocurdex/shared";
import { ChevronDown, ChevronRight, EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import {
  formatExecutionDuration,
  getExecutionToolCallDurationMs,
  getExecutionToolCallLabel,
  getOutputTail,
} from "./execution-tree-output";
import { ExecutionStatusIcon } from "./execution-tree-status-icon";

type OutputState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; result: AgentToolCallResult | null }
  | { status: "error" };

function ToolCallOutput({ state }: { state: OutputState }) {
  const { t } = useTranslation("sessions");
  if (state.status === "idle" || state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <Text className="ps-5" size="meta" tone="destructive">
        {t("executionTree.outputUnavailable")}
      </Text>
    );
  }
  const tail = getOutputTail(state.result);
  if (!tail) {
    return (
      <Text className="ps-5" size="meta" tone="muted">
        {t("executionTree.noOutput")}
      </Text>
    );
  }
  return (
    <div className="ms-5 flex flex-col gap-1">
      {tail.omittedLines > 0 ? (
        <Text size="meta" tone="muted">
          {t("executionTree.omittedLines", { count: tail.omittedLines })}
        </Text>
      ) : null}
      <pre className="max-h-48 overflow-auto rounded-control bg-muted px-2 py-1.5 font-mono text-meta whitespace-pre-wrap break-all text-foreground/80">
        {tail.text}
      </pre>
    </div>
  );
}

export function ExecutionToolCallRow({
  node,
}: {
  node: ExecutionToolCallNode;
}) {
  const { t } = useTranslation("sessions");
  const { toolCall, observability, subagent } = node;
  const [expanded, setExpanded] = useState(false);
  const [output, setOutput] = useState<OutputState>({ status: "idle" });
  const durationMs = getExecutionToolCallDurationMs(toolCall);
  const label = getExecutionToolCallLabel(toolCall);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (!next || output.status !== "idle") return;
    setOutput({ status: "loading" });
    desktopApi.getToolCallResult(toolCall.id).then(
      (result) => setOutput({ status: "loaded", result }),
      () => setOutput({ status: "error" }),
    );
  };
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="flex min-w-0 flex-col gap-1 pb-0.5">
      <button
        aria-expanded={expanded}
        className="flex h-7 w-full min-w-0 items-center gap-2 rounded-control px-1 text-start hover:bg-accent"
        onClick={toggle}
        title={toolCall.title}
        type="button"
      >
        <ExecutionStatusIcon status={toolCall.status} />
        <Text className="min-w-0 flex-1 font-mono" size="meta" truncate>
          {label}
        </Text>
        {durationMs === null ? null : (
          <Text className="shrink-0 tabular-nums" size="meta" tone="muted">
            {formatExecutionDuration(durationMs)}
          </Text>
        )}
        <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {expanded ? <ToolCallOutput state={output} /> : null}
      {observability === "limited" ? (
        <div className="flex min-h-6 min-w-0 items-center gap-2 ps-6">
          <EyeOff className="size-3.5 shrink-0 text-muted-foreground" />
          <Text className="min-w-0 flex-1" size="meta" tone="muted" truncate>
            {t("executionTree.limited", {
              name: subagent?.description || subagent?.type || "",
            })}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
