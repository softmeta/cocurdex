import type { AgentToolCallRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { FileText, ScrollText, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui";
import { cn, useMountEffect } from "@/lib";

import { ReadonlySubagentSession } from "./subagent-session-detail";
import { ToolCallStatusIcon } from "./tool-call-status-icon";
import {
  fetchToolCallResultAtom,
  toolCallResultCacheAtom,
} from "./tool-call-store";
import {
  formatToolCallData,
  formatToolCallOutput,
  getLineRangeLabel,
  getSubagentChildSessionId,
  getSubagentDescription,
  getSubagentType,
  getToolCallDetailLabel,
  getToolCallInputEntries,
  getToolCallPreviewLocations,
  getToolCallStatusClasses,
  getToolCallStatusLabel,
  getToolCallTimestamp,
  getToolCallTitle,
  getToolPreviewTitle,
  isMultilineInputField,
  isSubagentToolCall,
  type ToolCallPreviewLocation,
} from "./tool-call-utils";

// Whether the tool call could plausibly carry output. Pending / in-progress
// calls haven't produced rawOutput yet — skip the IPC round-trip and let the
// next tool.finished event seed the cache instead.
function canHaveOutput(toolCall: AgentToolCallRecord) {
  return toolCall.status === "completed" || toolCall.status === "failed";
}

export function ToolCallDetailHeader({
  toolCall,
}: {
  toolCall: AgentToolCallRecord;
}) {
  const statusLabel = getToolCallStatusLabel(toolCall);
  const timestamp = getToolCallTimestamp(toolCall);
  const isSubagent = isSubagentToolCall(toolCall);
  const title = isSubagent
    ? getSubagentDescription(toolCall)
    : getToolCallTitle(toolCall);
  const type = isSubagent ? getSubagentType(toolCall) : null;
  const showType = Boolean(type && type !== title);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-chat-fg-muted text-meta">
      <ToolCallStatusIcon toolCall={toolCall} />
      <span className="min-w-0 flex-1 truncate text-body font-medium text-chat-fg">
        {title}
      </span>
      {showType ? <span className="shrink-0">{type}</span> : null}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className={getToolCallStatusClasses(toolCall)}>
          {statusLabel}
        </span>
        <span>·</span>
        <span>{timestamp}</span>
      </span>
    </div>
  );
}

// Body content shared by both the desktop Popover and the narrow-screen Sheet.
// Renders optional file preview list, structured input entries (or raw JSON
// fallback), subagent transcript, and raw output. The status header is owned by
// the surrounding surface (the trigger row for the popover, a dedicated header
// bar for the sheet), so the body never repeats it.
export function ToolCallDetailBody({
  toolCall,
  onOpenToolLocation,
}: {
  toolCall: AgentToolCallRecord;
  onOpenToolLocation?: (location: ToolCallPreviewLocation) => void;
}) {
  const { t } = useTranslation("agent");
  const previewLocations = getToolCallPreviewLocations(toolCall);
  const shouldHideRawOutput =
    toolCall.kind === "read" && previewLocations.length > 0;
  // Result fields are fetched lazily for records loaded via the summary path.
  // Live-event records and seeded cache entries skip this IPC round-trip.
  const resultCache = useAtomValue(toolCallResultCacheAtom);
  const fetchToolCallResult = useSetAtom(fetchToolCallResultAtom);
  const hasInlineResult =
    toolCall.content !== undefined && toolCall.rawOutput !== undefined;
  const isSubagent = isSubagentToolCall(toolCall);
  const shouldLazyLoadOutput =
    !hasInlineResult &&
    !shouldHideRawOutput &&
    !isSubagent &&
    canHaveOutput(toolCall);
  const cacheEntry = resultCache[toolCall.id];
  const shouldFetchOutput =
    shouldLazyLoadOutput && (!cacheEntry || cacheEntry.status === "error");

  const resultValue = hasInlineResult
    ? {
        content: toolCall.content ?? [],
        rawOutput: toolCall.rawOutput,
      }
    : cacheEntry?.status === "loaded"
      ? cacheEntry.value
      : undefined;
  const output =
    resultValue !== undefined
      ? formatToolCallOutput(resultValue?.content, resultValue?.rawOutput)
      : "";
  const childSessionId = getSubagentChildSessionId(toolCall);
  const outputLoadStatus: "ready" | "loading" | "error" =
    hasInlineResult || cacheEntry?.status === "loaded"
      ? "ready"
      : cacheEntry?.status === "error"
        ? "error"
        : shouldLazyLoadOutput
          ? "loading"
          : "ready";
  const outputErrorMessage =
    cacheEntry?.status === "error" ? cacheEntry.message : "";
  const showOutputBlock =
    !isSubagent &&
    !shouldHideRawOutput &&
    (outputLoadStatus !== "ready" || Boolean(output));
  const detailLabel = getToolCallDetailLabel(toolCall);
  const inputEntries = getToolCallInputEntries(toolCall);
  const inputFallback = inputEntries
    ? null
    : formatToolCallData(toolCall.rawInput);
  const showInputBlock = !isSubagent;

  return (
    <div className="flex flex-col gap-3 text-sm text-chat-fg-secondary">
      {shouldFetchOutput ? (
        <ToolCallResultLoader
          fetchToolCallResult={fetchToolCallResult}
          toolCallId={toolCall.id}
        />
      ) : null}
      {previewLocations.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-chat-fg-muted">
            <FileText className="size-3" />
            {t("toolCalls.readFiles")}
          </div>
          <div className="flex flex-col gap-0.5">
            {previewLocations.map((location) => {
              const rangeLabel = getLineRangeLabel(
                location.startLine,
                location.endLine,
              );

              return (
                <button
                  className="flex flex-col gap-0.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-chat-surface-tint-hover"
                  key={`${location.filePath}:${location.startLine ?? ""}:${location.endLine ?? ""}`}
                  onClick={() => onOpenToolLocation?.(location)}
                  type="button"
                >
                  <div className="min-w-0 truncate text-sm text-chat-fg-secondary">
                    {getToolPreviewTitle(location)}
                  </div>
                  <div className="truncate text-xs text-chat-fg-muted">
                    {location.filePath}
                    {rangeLabel ? ` · ${rangeLabel}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : toolCall.locations.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-chat-fg-muted">
            <FileText className="size-3" />
            {t("toolCalls.files", { count: toolCall.locations.length })}
          </div>
          <ul className="flex flex-col gap-0.5 text-sm text-chat-fg-subtle">
            {toolCall.locations.map((location) => (
              <li
                className="flex items-center gap-2 px-2 py-1"
                key={`${location.path}:${location.line ?? ""}`}
              >
                <FileText className="size-3.5 shrink-0 text-chat-fg-muted" />
                <span className="truncate">
                  {location.path}
                  {location.line ? `:${location.line}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {showInputBlock && inputEntries ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-chat-fg-muted">
            <Terminal className="size-3" />
            {detailLabel}
          </div>
          {/* Each code panel owns its bounded scroll region, with default scroll
              chaining so the surrounding chat keeps scrolling at panel edges. */}
          <dl className="flex max-h-[40vh] flex-col gap-1.5 overflow-auto rounded-control border border-chat-border-soft bg-chat-code-panel p-3 text-xs leading-5">
            {inputEntries.map((entry) => {
              const multiline = isMultilineInputField(entry);
              return (
                <div
                  className={cn(
                    "min-w-0",
                    multiline ? "flex flex-col gap-1" : "flex gap-3",
                  )}
                  key={entry.key}
                >
                  <dt
                    className={cn(
                      "shrink-0 text-chat-fg-muted",
                      !multiline && "w-24",
                    )}
                  >
                    {entry.label}
                  </dt>
                  <dd
                    className={cn(
                      "min-w-0 whitespace-pre-wrap break-words text-chat-fg-secondary",
                      entry.mono &&
                        "font-mono [font-variant-ligatures:none] text-chat-fg",
                    )}
                  >
                    {entry.value}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : showInputBlock && inputFallback ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-chat-fg-muted">
            <Terminal className="size-3" />
            {detailLabel}
          </div>
          <pre className="overflow-x-auto whitespace-pre rounded-control border border-chat-border-soft bg-chat-code-panel p-3 font-mono text-xs leading-5 text-chat-fg-secondary [font-variant-ligatures:none]">
            {inputFallback}
          </pre>
        </div>
      ) : null}
      {isSubagent ? (
        <ReadonlySubagentSession sessionId={childSessionId ?? null} />
      ) : null}
      {showOutputBlock ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-chat-fg-muted">
            <ScrollText className="size-3" />
            {t("toolCalls.output")}
          </div>
          {outputLoadStatus === "loading" ? (
            <div className="flex items-center gap-2 rounded-control border border-chat-border-soft bg-chat-code-panel p-3 text-xs text-chat-fg-muted">
              <Spinner size="xs" />
              <span>{t("toolCalls.outputLoading")}</span>
            </div>
          ) : outputLoadStatus === "error" ? (
            <div className="rounded-control border border-chat-border-soft bg-chat-code-panel p-3 text-xs text-chat-fg-muted">
              {t("toolCalls.outputLoadError", { message: outputErrorMessage })}
            </div>
          ) : (
            <pre
              className={cn(
                "max-h-[40vh] overflow-auto rounded-control border border-chat-border-soft bg-chat-code-panel p-3 font-mono text-xs leading-5 whitespace-pre text-chat-fg-secondary [font-variant-ligatures:none]",
              )}
            >
              {output}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ToolCallResultLoader({
  fetchToolCallResult,
  toolCallId,
}: {
  fetchToolCallResult: (toolCallId: string) => void | Promise<void>;
  toolCallId: string;
}) {
  useMountEffect(() => {
    void fetchToolCallResult(toolCallId);
  });

  return null;
}
