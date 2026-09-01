import type { AgentToolCallRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui";
import { activeConversationIdAtom } from "@/features/chat";
import { selectSessionAtom } from "@/features/sessions";
import { cn } from "@/lib";

import { chatDisplaySettingsAtom } from "../chat-display";
import { ToolCallDetailBody } from "./tool-call-detail";
import { ToolCallStatusIcon } from "./tool-call-status-icon";
import {
  getSubagentChildSessionId,
  getSubagentDescription,
  getSubagentType,
  getToolCallGroupCountLabel,
  getToolCallStatusClasses,
  getToolCallStatusLabel,
  getToolCallTriggerParts,
  isSubagentToolCall,
  partitionToolCallRuns,
  type ToolCallPreviewLocation,
} from "./tool-call-utils";

function ToolCallTriggerRow({ toolCall }: { toolCall: AgentToolCallRecord }) {
  const { secondary, title } = getToolCallTriggerParts(toolCall);
  // The target (file path, command, query) is what makes one "read" row
  // distinguishable from the next — without it the rows are interchangeable and
  // force a click to learn anything. Commands keep a short action label and put
  // their content in the truncating secondary slot so they cannot widen chat.
  const isCompleted = toolCall.status === "completed";
  // Completed rows lean entirely on the status icon, and the enclosing group
  // header already carries the shared time range — so a finished row is just
  // "icon + title + target". Only non-completed states (failed / pending /
  // running) still surface a text label, keeping problems and in-flight work
  // visible. A succeeded check is muted to neutral so red failures are the only
  // colored status in the timeline.
  const showStatusLabel = !isCompleted;

  return (
    <>
      <ToolCallStatusIcon
        toolCall={toolCall}
        className={cn(
          "shrink-0",
          isCompleted
            ? "text-chat-fg-subtle"
            : getToolCallStatusClasses(toolCall),
        )}
      />
      <span
        className={cn(
          "text-chat-fg-secondary",
          secondary ? "shrink-0" : "min-w-0 truncate",
        )}
      >
        {title}
      </span>
      {secondary ? (
        <span className="min-w-0 flex-1 truncate font-mono text-chat-fg-muted [font-variant-ligatures:none]">
          {secondary}
        </span>
      ) : null}
      {showStatusLabel ? (
        <span
          className={cn("shrink-0 ml-auto", getToolCallStatusClasses(toolCall))}
        >
          {getToolCallStatusLabel(toolCall)}
        </span>
      ) : null}
    </>
  );
}

function getSubagentTypeClasses(toolCall: AgentToolCallRecord) {
  if (toolCall.status === "failed") {
    return "text-chat-status-failed-fg";
  }

  if (toolCall.status === "pending") {
    return "text-chat-status-pending-fg";
  }

  if (toolCall.status === "in_progress") {
    return "text-chat-status-running-fg";
  }

  return "text-chat-link";
}

function getSubagentChipSurfaceClasses(toolCall: AgentToolCallRecord) {
  if (toolCall.status === "failed") {
    return "bg-chat-status-failed-bg";
  }

  if (toolCall.status === "pending") {
    return "bg-chat-status-pending-bg";
  }

  if (toolCall.status === "in_progress") {
    return "bg-chat-status-running-bg";
  }

  return "bg-chat-surface-tint-hover";
}

function SubagentTriggerCard({ toolCall }: { toolCall: AgentToolCallRecord }) {
  const type = getSubagentType(toolCall);
  const description = getSubagentDescription(toolCall);
  const isCompleted = toolCall.status === "completed";
  const showType = Boolean(type && type !== description);

  return (
    <>
      <ToolCallStatusIcon
        className={cn("shrink-0", getToolCallStatusClasses(toolCall))}
        toolCall={toolCall}
      />
      <span className="min-w-0 truncate font-medium text-chat-fg">
        {description}
      </span>
      {showType ? (
        <span className={cn("shrink-0", getSubagentTypeClasses(toolCall))}>
          {type}
        </span>
      ) : null}
      {isCompleted ? null : (
        <span className={cn("shrink-0", getToolCallStatusClasses(toolCall))}>
          {getToolCallStatusLabel(toolCall)}
        </span>
      )}
      <ChevronRight
        aria-hidden
        className="size-3.5 shrink-0 text-chat-fg-muted rtl:-scale-x-100"
      />
    </>
  );
}

function ToolCallItem({
  toolCall,
  onOpenToolLocation,
}: {
  toolCall: AgentToolCallRecord;
  onOpenToolLocation?: (location: ToolCallPreviewLocation) => void;
}) {
  const selectSession = useSetAtom(selectSessionAtom);
  const setActiveConversationId = useSetAtom(activeConversationIdAtom);

  if (isSubagentToolCall(toolCall)) {
    const description = getSubagentDescription(toolCall);
    const type = getSubagentType(toolCall);
    const statusLabel = getToolCallStatusLabel(toolCall);
    const accessibleName = [description, type, statusLabel]
      .filter(Boolean)
      .join(", ");
    const childSessionId = getSubagentChildSessionId(toolCall);

    return (
      <button
        aria-label={accessibleName}
        className={cn(
          "flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-control px-2 py-1 text-left text-meta whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          getSubagentChipSurfaceClasses(toolCall),
        )}
        onClick={() => {
          if (!childSessionId) {
            return;
          }
          setActiveConversationId(null);
          selectSession(childSessionId);
        }}
        type="button"
      >
        <SubagentTriggerCard toolCall={toolCall} />
      </button>
    );
  }

  return (
    <Collapsible className="w-full min-w-0 overflow-hidden">
      <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2 rounded-control px-1.5 py-1 text-left text-chat-fg-muted text-meta transition-colors hover:bg-chat-surface-row-hover">
        <ToolCallTriggerRow toolCall={toolCall} />
      </CollapsibleTrigger>
      <CollapsibleContent className="ms-5.5 pt-1">
        <div className="pb-1 text-chat-fg-secondary text-sm">
          <ToolCallDetailBody
            onOpenToolLocation={onOpenToolLocation}
            toolCall={toolCall}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ToolCallGroup({
  toolCalls,
  onOpenToolLocation,
  nested = false,
}: {
  toolCalls: AgentToolCallRecord[];
  onOpenToolLocation?: (location: ToolCallPreviewLocation) => void;
  // When rendered inside an ActivityBlock the activity header already carries
  // the count / status rollup and supplies the enclosing guide line.
  // `nested` flattens the calls straight into the activity timeline instead of
  // wrapping them in a second collapsible + guide line, so each tool row sits
  // at the same depth as the reasoning rows around it and the whole run reads
  // as one execution log.
  nested?: boolean;
}) {
  const { t } = useTranslation("agent");
  const { activityDisplay } = useAtomValue(chatDisplaySettingsAtom);
  const runs = partitionToolCallRuns(toolCalls);

  if (activityDisplay === "hidden") {
    return null;
  }

  const runNodes = runs.map((run) => {
    if (run.kind === "subagent") {
      return (
        <div className="flex w-full min-w-0 gap-1" key={run.toolCalls[0]?.id}>
          {run.toolCalls.map((toolCall) => (
            <ToolCallItem
              key={toolCall.id}
              onOpenToolLocation={onOpenToolLocation}
              toolCall={toolCall}
            />
          ))}
        </div>
      );
    }

    if (nested) {
      return (
        <Fragment key={run.toolCalls[0]?.id}>
          {run.toolCalls.map((toolCall) => (
            <ToolCallItem
              key={toolCall.id}
              onOpenToolLocation={onOpenToolLocation}
              toolCall={toolCall}
            />
          ))}
        </Fragment>
      );
    }

    return (
      <Collapsible
        className="group/tool-group w-full"
        defaultOpen
        key={run.toolCalls[0]?.id}
      >
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 py-0.5 text-sm transition-colors hover:text-chat-fg">
          <span className="hidden shrink-0 text-xs font-medium text-chat-fg-muted sm:inline">
            {t("toolCalls.title")}
          </span>
          <span className="shrink-0 text-sm font-medium text-chat-fg">
            {getToolCallGroupCountLabel(run.toolCalls)}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn(
            "mt-1 flex flex-col items-start gap-1 ms-[7px] border-s border-chat-border-soft ps-[14px]",
          )}
        >
          {run.toolCalls.map((toolCall) => (
            <ToolCallItem
              key={toolCall.id}
              onOpenToolLocation={onOpenToolLocation}
              toolCall={toolCall}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  });

  if (nested) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-0.5 overflow-hidden">
        {runNodes}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl min-w-0 flex-col gap-2 overflow-hidden">
      {runNodes}
    </div>
  );
}
