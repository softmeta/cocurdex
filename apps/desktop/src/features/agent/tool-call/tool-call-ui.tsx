import type { AgentToolCallRecord } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui";
import { cn } from "@/lib";

import { chatDisplaySettingsAtom } from "../chat-display";
import { ToolCallDetailBody, ToolCallDetailHeader } from "./tool-call-detail";
import { ToolCallStatusIcon } from "./tool-call-status-icon";
import {
  getOpenCodeSubagentDescription,
  getOpenCodeSubagentType,
  getToolCallGroupCountLabel,
  getToolCallStatusClasses,
  getToolCallStatusLabel,
  getToolCallStatusSummary,
  getToolCallTitle,
  getToolCallTriggerParts,
  isOpenCodeSubagentToolCall,
  type ToolCallPreviewLocation,
  type ToolCallStatusSummaryPart,
  type ToolCallStatusSummaryTone,
} from "./tool-call-utils";

const DEFAULT_CHAT_SHEET_RIGHT_OFFSET = "0px";

type ChatScopedSheetStyle = CSSProperties & {
  "--chat-sheet-right-offset"?: string;
};

function getChatPaneElement(trigger: HTMLElement | null) {
  return trigger?.closest("section") ?? null;
}

function useChatSheetRightOffset(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
) {
  const [rightOffset, setRightOffset] = useState(
    DEFAULT_CHAT_SHEET_RIGHT_OFFSET,
  );

  useLayoutEffect(() => {
    if (!open) {
      setRightOffset(DEFAULT_CHAT_SHEET_RIGHT_OFFSET);
      return;
    }

    const chatPane = getChatPaneElement(triggerRef.current);
    if (!chatPane) {
      setRightOffset(DEFAULT_CHAT_SHEET_RIGHT_OFFSET);
      return;
    }

    const updateOffset = () => {
      const paneRect = chatPane.getBoundingClientRect();
      const nextOffset = Math.max(0, window.innerWidth - paneRect.right);
      setRightOffset(`${Math.round(nextOffset)}px`);
    };

    updateOffset();
    const resizeObserver = new ResizeObserver(updateOffset);
    resizeObserver.observe(chatPane);
    window.addEventListener("resize", updateOffset);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, [open, triggerRef]);

  return rightOffset;
}

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

function SubagentTriggerCard({ toolCall }: { toolCall: AgentToolCallRecord }) {
  const { t } = useTranslation("agent");
  const type = getOpenCodeSubagentType(toolCall) ?? t("toolCalls.subagent");
  const description = getOpenCodeSubagentDescription(toolCall);
  const isRunning =
    toolCall.status === "pending" || toolCall.status === "in_progress";

  return (
    <>
      {isRunning ? (
        <span aria-hidden className="subagent-trigger-activity" />
      ) : null}
      <span className="shrink-0 text-chat-status-running-fg text-display font-semibold">
        {type}
      </span>
      <span className="min-w-0 truncate text-display text-chat-fg-secondary">
        {description}
      </span>
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
  const isSubagent = isOpenCodeSubagentToolCall(toolCall);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const sheetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sheetRightOffset = useChatSheetRightOffset(
    isSheetOpen,
    sheetTriggerRef,
  );
  const sheetStyle: ChatScopedSheetStyle = {
    "--chat-sheet-right-offset": sheetRightOffset,
  };
  const body: ReactNode = (
    <ToolCallDetailBody
      onOpenToolLocation={onOpenToolLocation}
      toolCall={toolCall}
    />
  );

  // Subagents render a full nested transcript, so they keep the right-sliding
  // sheet — inlining that volume of content would bury the rest of the chat.
  if (isSubagent) {
    return (
      <Sheet modal={false} onOpenChange={setIsSheetOpen} open={isSheetOpen}>
        <SheetTrigger
          className={cn(
            "relative flex max-w-full cursor-pointer items-center gap-2 overflow-hidden rounded-card border border-chat-border-soft bg-chat-surface-subtle px-4 py-3 text-left shadow-chat-soft transition-colors hover:border-chat-border hover:bg-chat-surface-tint-hover",
            (toolCall.status === "pending" ||
              toolCall.status === "in_progress") &&
              "subagent-trigger-running",
          )}
          ref={sheetTriggerRef}
        >
          <SubagentTriggerCard toolCall={toolCall} />
        </SheetTrigger>
        <SheetContent
          className={cn(
            // Match the chat theme instead of the default `bg-background` +
            // generic border, so the panel reads as part of the chat surface
            // rather than an OS-level dialog.
            "w-full gap-0 overflow-hidden data-[side=right]:sm:max-w-xl right-(--chat-sheet-right-offset) border-chat-border-soft bg-chat-surface-raised",
          )}
          closeButtonClassName="app-no-drag top-6 right-6 -translate-y-1/2"
          showOverlay={false}
          side="right"
          style={sheetStyle}
        >
          <SheetTitle className="sr-only">
            {getToolCallTitle(toolCall)}
          </SheetTitle>
          <div className="flex h-12 shrink-0 items-center border-chat-border-soft border-b px-6 pr-14">
            <ToolCallDetailHeader toolCall={toolCall} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-3 pb-4">
            {body}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Regular tool calls expand inline so the detail joins the document flow and
  // pushes later rows down instead of floating over them. The capped, scrollable
  // body keeps very long output from running off the screen.
  return (
    <Collapsible className="w-full min-w-0 overflow-hidden">
      {/* No horizontal padding: first-level tool rows must align flush with the
          activity/group header and with adjacent reasoning rows. */}
      <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2 rounded-control px-1.5 py-1 text-left text-chat-fg-muted text-meta transition-colors hover:bg-chat-surface-row-hover">
        <ToolCallTriggerRow toolCall={toolCall} />
      </CollapsibleTrigger>
      {/* Align the expanded detail with the trigger's title (status icon):
          chevron (14) + gap-2 (8) = 22px. No guide line, so the detail reads
          as a continuation of the row above. Each code panel inside owns its
          bounded, overscroll-contained scroll. */}
      <CollapsibleContent className="ms-5.5 pt-1">
        <div className="pb-1 text-chat-fg-secondary text-sm">{body}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function getStatusSummaryToneClass(tone: ToolCallStatusSummaryTone) {
  if (tone === "failed") {
    return "text-chat-status-failed-fg";
  }

  if (tone === "running") {
    return "text-chat-status-running-fg";
  }

  if (tone === "pending") {
    return "text-chat-status-pending-fg";
  }

  // Completed is context in a mixed rollup, not a celebration. All-success
  // stays silent; when it appears next to a problem, keep it muted so only
  // failures and in-flight work earn status color.
  return "text-chat-fg-muted";
}

export function StatusSummaryMeta({
  statusSummary,
}: {
  statusSummary: ToolCallStatusSummaryPart[];
}) {
  if (statusSummary.length === 0) {
    return null;
  }

  return (
    <span className="ml-auto min-w-0 shrink-0 truncate text-xs">
      {statusSummary.map((part, index) => (
        <Fragment key={part.tone}>
          {index > 0 ? <span className="text-chat-fg-subtle"> · </span> : null}
          <span className={getStatusSummaryToneClass(part.tone)}>
            {part.label}
          </span>
        </Fragment>
      ))}
    </span>
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
  const subagentToolCalls = toolCalls.filter(isOpenCodeSubagentToolCall);
  const regularToolCalls = toolCalls.filter(
    (toolCall) => !isOpenCodeSubagentToolCall(toolCall),
  );
  const countLabel = getToolCallGroupCountLabel(regularToolCalls);
  const statusSummary = getToolCallStatusSummary(regularToolCalls);

  if (activityDisplay === "hidden") {
    return null;
  }

  if (nested) {
    return (
      <div className="flex w-full min-w-0 flex-col items-start gap-0.5 overflow-hidden">
        {subagentToolCalls.map((toolCall) => (
          <ToolCallItem
            key={toolCall.id}
            onOpenToolLocation={onOpenToolLocation}
            toolCall={toolCall}
          />
        ))}
        {regularToolCalls.map((toolCall) => (
          <ToolCallItem
            key={toolCall.id}
            onOpenToolLocation={onOpenToolLocation}
            toolCall={toolCall}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl min-w-0 flex-col items-start gap-2 overflow-hidden">
      {subagentToolCalls.map((toolCall) => (
        <ToolCallItem
          key={toolCall.id}
          onOpenToolLocation={onOpenToolLocation}
          toolCall={toolCall}
        />
      ))}
      {regularToolCalls.length > 0 ? (
        <Collapsible className="group/tool-group w-full" defaultOpen>
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 py-0.5 text-sm transition-colors hover:text-chat-fg">
            <span className="hidden shrink-0 text-xs font-medium text-chat-fg-muted sm:inline">
              {t("toolCalls.title")}
            </span>
            <span className="shrink-0 text-sm font-medium text-chat-fg">
              {countLabel}
            </span>
            <StatusSummaryMeta statusSummary={statusSummary} />
          </CollapsibleTrigger>
          {/* A subtle guide rail + indent nests the rows under the header so the
              run reads as the group's children, not a sibling list (see
              the inline guide class). Nested (condensed) groups skip this —
              there the ActivityBlock already supplies the enclosing level. */}
          <CollapsibleContent
            className={cn(
              "mt-1 flex flex-col items-start gap-1 ms-[7px] border-s border-chat-border-soft ps-[14px]",
            )}
          >
            {regularToolCalls.map((toolCall) => (
              <ToolCallItem
                key={toolCall.id}
                onOpenToolLocation={onOpenToolLocation}
                toolCall={toolCall}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
