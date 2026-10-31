import type { ExecutionInteraction } from "@cocurdex/shared";
import { formatDurationMs } from "@cocurdex/shared";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Hand,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton, Text } from "@/components/ui";
import { AgentIconLabel, getAgentDisplayLabel } from "@/features/sessions";
import { getRunDurationMs } from "./execution-tree-output";
import type {
  ExecutionCallSummary,
  ExecutionTreeRow,
  ExpandableExecutionTreeRow,
} from "./execution-tree-rows";
import { ExecutionStatusIcon } from "./execution-tree-status-icon";
import { ExecutionToolCallRow } from "./execution-tree-tool-call-row";

type RowOf<K extends ExecutionTreeRow["kind"]> = Extract<
  ExecutionTreeRow,
  { kind: K }
>;

function useInteractionLabel() {
  const { t } = useTranslation("sessions");
  return (interaction: ExecutionInteraction) => {
    if (interaction.kind === "permission") {
      return t("executionTree.waitingPermission", {
        title: interaction.record.title,
      });
    }
    if (interaction.kind === "question") {
      return t("executionTree.waitingAnswer", {
        question: interaction.record.question,
      });
    }
    return t("executionTree.waitingPlanApproval");
  };
}

function CallSummary({
  summary,
  prefix,
}: {
  summary: ExecutionCallSummary;
  prefix?: string | null;
}) {
  const { t } = useTranslation("sessions");
  const parts = [
    prefix,
    summary.toolCount > 0
      ? t("executionTree.toolCount", { count: summary.toolCount })
      : null,
  ].filter((part): part is string => Boolean(part));
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {parts.length > 0 ? (
        <Text className="tabular-nums" size="meta" tone="muted">
          {parts.join(" · ")}
        </Text>
      ) : null}
      {summary.failedCount > 0 ? (
        <Text className="tabular-nums" size="meta" tone="destructive">
          {t("executionTree.failedCount", { count: summary.failedCount })}
        </Text>
      ) : null}
      {summary.waitingCount > 0 ? (
        <Text className="text-status-warning tabular-nums" size="meta">
          {t("executionTree.waitingCount", { count: summary.waitingCount })}
        </Text>
      ) : null}
    </span>
  );
}

function ExpandableRow({
  row,
  onToggle,
  children,
}: {
  row: ExpandableExecutionTreeRow;
  onToggle(row: ExpandableExecutionTreeRow): void;
  children: ReactNode;
}) {
  const Chevron = row.expanded ? ChevronDown : ChevronRight;
  if (!row.expandable) {
    return (
      <div className="flex h-7 w-full min-w-0 items-center gap-2 px-1">
        <span aria-hidden className="size-3.5 shrink-0" />
        {children}
      </div>
    );
  }
  return (
    <button
      aria-expanded={row.expanded}
      className="flex h-7 w-full min-w-0 items-center gap-2 rounded-control px-1 text-start hover:bg-accent"
      onClick={() => onToggle(row)}
      type="button"
    >
      <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
      {children}
    </button>
  );
}

function TrailingActionSpace() {
  return <span aria-hidden className="size-6 shrink-0" />;
}

function OpenSessionButton({
  title,
  onOpen,
}: {
  title: string;
  onOpen(): void;
}) {
  const { t } = useTranslation("sessions");
  const label = t("executionTree.openSession", { title });
  return (
    <IconButton
      aria-label={label}
      className="shrink-0 text-muted-foreground"
      onClick={onOpen}
      size="xs"
    >
      <ArrowUpRight className="size-3.5" />
    </IconButton>
  );
}

function SessionRowContent({
  row,
  onToggle,
  onOpenSession,
}: {
  row: RowOf<"session">;
  onToggle(row: ExpandableExecutionTreeRow): void;
  onOpenSession(sessionId: string): void;
}) {
  const { t } = useTranslation("sessions");
  const { session, plan } = row.node;
  const done = plan?.steps.filter((step) => step.status === "completed");
  const planProgress = plan
    ? t("executionTree.planProgress", {
        done: done?.length ?? 0,
        total: plan.steps.length,
      })
    : null;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ExpandableRow onToggle={onToggle} row={row}>
        <ExecutionStatusIcon status={session.status} />
        <Text className="min-w-0 flex-1 font-medium" size="body" truncate>
          {session.title}
        </Text>
        {row.expanded ? null : (
          <CallSummary prefix={planProgress} summary={row.summary} />
        )}
        {row.showAgent ? (
          <Text className="shrink-0" size="meta" tone="muted">
            <AgentIconLabel agentId={session.agentType}>
              {getAgentDisplayLabel(session.agentType)}
            </AgentIconLabel>
          </Text>
        ) : null}
      </ExpandableRow>
      <OpenSessionButton
        onOpen={() => onOpenSession(session.id)}
        title={session.title}
      />
    </div>
  );
}

function RunRowContent({
  row,
  onToggle,
}: {
  row: RowOf<"run">;
  onToggle(row: ExpandableExecutionTreeRow): void;
}) {
  const { t } = useTranslation("sessions");
  const durationMs = getRunDurationMs(row.run);
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-1">
        <ExpandableRow onToggle={onToggle} row={row}>
          <ExecutionStatusIcon status={row.run.status} />
          <Text className="min-w-0 flex-1" size="body" tone="subtle" truncate>
            {t("executionTree.run", {
              time: new Date(row.run.startedAt).toLocaleString(),
            })}
          </Text>
          <CallSummary
            prefix={durationMs === null ? null : formatDurationMs(durationMs)}
            summary={row.summary}
          />
        </ExpandableRow>
        <TrailingActionSpace />
      </div>
      {row.run.error ? (
        <Text className="ps-12" size="meta" tone="destructive" truncate>
          {row.run.error}
        </Text>
      ) : null}
    </div>
  );
}

function ToolGroupRowContent({
  row,
  onToggle,
}: {
  row: RowOf<"toolGroup">;
  onToggle(row: ExpandableExecutionTreeRow): void;
}) {
  const { t } = useTranslation("sessions");
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ExpandableRow onToggle={onToggle} row={row}>
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <Text className="min-w-0 flex-1" size="body" tone="subtle" truncate>
          {t("executionTree.toolCalls")}
        </Text>
        <CallSummary summary={row.summary} />
      </ExpandableRow>
      <TrailingActionSpace />
    </div>
  );
}

export function ExecutionTreeRowContent({
  row,
  onOpenSession,
  onToggle,
}: {
  row: ExecutionTreeRow;
  onOpenSession(sessionId: string): void;
  onToggle(row: ExpandableExecutionTreeRow): void;
}) {
  const { t } = useTranslation("sessions");
  const interactionLabel = useInteractionLabel();

  if (row.kind === "session") {
    return (
      <SessionRowContent
        onOpenSession={onOpenSession}
        onToggle={onToggle}
        row={row}
      />
    );
  }
  if (row.kind === "run") {
    return <RunRowContent onToggle={onToggle} row={row} />;
  }
  if (row.kind === "toolGroup") {
    return <ToolGroupRowContent onToggle={onToggle} row={row} />;
  }
  if (row.kind === "toolCall") {
    return <ExecutionToolCallRow node={row.node} />;
  }
  if (row.kind === "interaction") {
    return (
      <div className="flex h-7 min-w-0 items-center gap-2 px-1">
        <Hand className="size-3.5 shrink-0 text-status-warning" />
        <Text className="min-w-0 flex-1" size="body" truncate>
          {interactionLabel(row.interaction)}
        </Text>
      </div>
    );
  }
  return (
    <Text className="flex h-7 items-center px-1" size="meta" tone="muted">
      {t("executionTree.truncated")}
    </Text>
  );
}
