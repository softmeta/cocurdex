import {
  type AgentPermissionDecision,
  type AgentQuestionRequestRecord,
  type AgentToolCallRecord,
  type AgentUsageRecord,
  isContextAttachment,
  isDocumentAttachment,
  isImageAttachment,
  type MessageRecord,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { Check, Copy, Pencil, X } from "lucide-react";
import type { RefObject } from "react";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownContent,
  AppDropdownItem,
  MarkdownRenderer,
} from "@/components";
import {
  Button,
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import {
  DocumentAttachmentChips,
  ImageAttachmentCards,
} from "@/features/composer";
import { useTurnChangeSet } from "@/features/turn-workspace-changes";
import { TurnChangesCard } from "@/features/turn-workspace-changes/turn-changes-card";
import { cn, isPerfEnabled, logSessionSwitchPerf } from "@/lib";
import { chatDisplaySettingsAtom } from "../chat-display";
import { PermissionCard } from "../permission";
import { QuestionCard } from "../question";
// Deep imports (not the tool-call barrel): the barrel pulls in the subagent
// detail view, which renders this component.
import { ToolCallGroup } from "../tool-call/tool-call-ui";
import type { ToolCallPreviewLocation } from "../tool-call/tool-call-utils";
import type { ActivityState } from "./chat-activity";
import { ActivityLine } from "./chat-activity";
import { ActivityBlock } from "./chat-activity-block";
import {
  isReasoningMessage,
  MessageAttachments,
  ReasoningMarkdown,
  UserMessageContent,
} from "./chat-message";
import type { ConversationGroup, TimelineGroup } from "./chat-timeline";
import {
  getVisibleConversationItems,
  segmentConversationItems,
} from "./chat-timeline";
import { turnStatsByMessageAtom } from "./message-store";
import { useMessageFilePathHandlers } from "./use-message-file-path-handlers";

function getMessageArticleClassName(message: MessageRecord) {
  const isReasoning = isReasoningMessage(message);

  if (isReasoning) {
    return "w-full min-w-0 max-w-3xl text-chat-fg-secondary";
  }

  if (message.role === "system") {
    return cn(
      "w-full min-w-0 max-w-3xl rounded-panel border border-chat-system-border bg-chat-system-bg px-3.5 py-2.5 text-chat-system-fg",
    );
  }

  if (message.role === "user") {
    return cn(
      "min-w-0 max-w-3xl rounded-panel rounded-tr-md border border-chat-border-soft bg-chat-surface-bubble px-3.5 py-2.5 text-chat-fg",
    );
  }

  return "w-full min-w-0 max-w-3xl text-chat-fg";
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatDurationMs(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatTokenCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toString();
}

function formatExactTokenCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function getTurnTokenCounts(usage: AgentUsageRecord | undefined) {
  if (!usage) {
    return null;
  }

  const newInputTokens = usage.inputTokens;
  const cacheReadInputTokens = usage.cacheReadInputTokens ?? 0;
  const cacheCreationInputTokens = usage.cacheCreationInputTokens ?? 0;
  const processedInputTokens =
    newInputTokens + cacheReadInputTokens + cacheCreationInputTokens;
  const outputTokens = usage.outputTokens;
  if (processedInputTokens <= 0 && outputTokens <= 0) {
    return null;
  }

  return {
    cacheCreationInputTokens,
    cacheReadInputTokens,
    newInputTokens,
    outputTokens,
    processedInputTokens,
  };
}

function TurnTokenUsage({ usage }: { usage: AgentUsageRecord | undefined }) {
  const { t } = useTranslation("agent");
  const counts = getTurnTokenCounts(usage);
  if (!counts) {
    return null;
  }

  const compactParts = [];
  if (counts.processedInputTokens > 0) {
    compactParts.push(`↑${formatTokenCount(counts.processedInputTokens)}`);
  }
  if (counts.outputTokens > 0) {
    compactParts.push(`↓${formatTokenCount(counts.outputTokens)}`);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={t("assistantMessage.turnUsage.ariaLabel")}
          className="cursor-help rounded-control px-0.5 transition-colors hover:bg-chat-surface-row-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          type="button"
        >
          {compactParts.join(" ")}
        </button>
      </TooltipTrigger>
      <TooltipContent
        className="flex max-w-xs flex-col items-start gap-1.5 whitespace-normal py-2 text-start"
        side="top"
        sideOffset={6}
      >
        {counts.processedInputTokens > 0 ? (
          <p>
            {t("assistantMessage.turnUsage.tooltipInput", {
              tokens: formatExactTokenCount(counts.processedInputTokens),
            })}
          </p>
        ) : null}
        {counts.newInputTokens > 0 ? (
          <p>
            {t("assistantMessage.turnUsage.tooltipNewInput", {
              tokens: formatExactTokenCount(counts.newInputTokens),
            })}
          </p>
        ) : null}
        {counts.cacheReadInputTokens > 0 ? (
          <p>
            {t("assistantMessage.turnUsage.tooltipCacheRead", {
              tokens: formatExactTokenCount(counts.cacheReadInputTokens),
            })}
          </p>
        ) : null}
        {counts.cacheCreationInputTokens > 0 ? (
          <p>
            {t("assistantMessage.turnUsage.tooltipCacheCreation", {
              tokens: formatExactTokenCount(counts.cacheCreationInputTokens),
            })}
          </p>
        ) : null}
        {counts.outputTokens > 0 ? (
          <p>
            {t("assistantMessage.turnUsage.tooltipOutput", {
              tokens: formatExactTokenCount(counts.outputTokens),
            })}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function createClipboardHtml(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const node of clone.querySelectorAll(
    "button, svg[aria-hidden='true']",
  )) {
    node.remove();
  }
  for (const node of clone.querySelectorAll("[class]")) {
    node.removeAttribute("class");
  }

  return {
    html: clone.innerHTML,
    text: (element.innerText ?? element.textContent ?? "").trim(),
  };
}

function getConversationSessionId(conversationGroup: ConversationGroup) {
  if (conversationGroup.prompt) {
    return conversationGroup.prompt.sessionId;
  }

  for (const item of conversationGroup.items) {
    if (item.kind === "message") {
      return item.message.sessionId;
    }

    if (item.kind === "toolCalls") {
      return item.toolCalls[0]?.sessionId ?? null;
    }

    if (item.kind === "permission") {
      return item.permission.sessionId;
    }

    if (item.kind === "question") {
      return item.question.sessionId;
    }
  }

  return null;
}

async function copyRenderedMessage(
  contentElement: HTMLElement | null,
  markdown: string,
) {
  if (
    contentElement &&
    typeof ClipboardItem !== "undefined" &&
    navigator.clipboard.write
  ) {
    const { html, text } = createClipboardHtml(contentElement);

    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text || markdown], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  await navigator.clipboard.writeText(markdown);
}

function UserPromptBody({
  draftContent,
  isContextVariant,
  isEditing,
  message,
  onCancelEdit,
  onDraftChange,
  onSubmit,
}: {
  draftContent: string | null;
  isContextVariant: boolean;
  isEditing: boolean;
  message: MessageRecord;
  onCancelEdit(): void;
  onDraftChange(value: string): void;
  onSubmit(): void;
}) {
  const { t } = useTranslation("agent");

  if (isEditing) {
    return (
      <div className="flex min-w-72 flex-col gap-2">
        <Textarea
          autoFocus
          className="max-h-72 min-h-24 resize-y text-sm"
          onChange={(event) => onDraftChange(event.target.value)}
          value={draftContent ?? ""}
        />
        <div className="flex justify-end gap-1.5">
          <Button
            aria-label={t("previousMessage.cancelEdit")}
            onClick={onCancelEdit}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X className="size-3.5" />
          </Button>
          <Button
            aria-label={t("previousMessage.submitEdit")}
            disabled={!(draftContent ?? "").trim()}
            onClick={onSubmit}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Check className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  if (isContextVariant) {
    return (
      <div className="whitespace-pre-wrap break-words text-left text-body leading-6">
        {message.content}
      </div>
    );
  }

  return <UserMessageContent message={message} />;
}

const UserPrompt = memo(function UserPrompt({
  canEdit,
  message,
  onSubmitEdit,
  setUserMessageRef,
  showActions = true,
  variant = "chat",
}: {
  canEdit: boolean;
  message: MessageRecord;
  onSubmitEdit?(message: MessageRecord, content: string): void;
  setUserMessageRef(id: string, element: HTMLDivElement | null): void;
  showActions?: boolean;
  variant?: "chat" | "context";
}) {
  const { t } = useTranslation("agent");
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const isEditing = draftContent !== null;
  const sentAt = formatMessageTime(message.createdAt);

  const handleSubmit = () => {
    const content = draftContent?.trim() ?? "";

    if (!content) {
      return;
    }

    onSubmitEdit?.(message, content);
    setDraftContent(null);
  };

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(message.content)
      .then(() => {
        setHasCopied(true);
        window.setTimeout(() => setHasCopied(false), 1200);
      })
      .catch(() => {});
  };

  const isContextVariant = variant === "context";
  const hasDocuments = message.attachments.some(isDocumentAttachment);
  const hasImages = message.attachments.some(isImageAttachment);
  const hasBubbleContent =
    isEditing ||
    isContextVariant ||
    message.content.trim().length > 0 ||
    message.attachments.some(isContextAttachment);
  const wrapperClassName = isContextVariant
    ? "flex w-full justify-start"
    : "flex w-full justify-end";
  const containerClassName = isContextVariant
    ? "group flex w-full min-w-0 max-w-3xl flex-col items-stretch gap-1"
    : "group flex min-w-0 max-w-3xl flex-col items-end gap-1.5";
  const articleClassName = isContextVariant
    ? cn(
        "w-full min-w-0 rounded-card border border-chat-border-soft bg-chat-surface-subtle px-4 py-3 text-chat-fg-secondary shadow-chat-soft",
      )
    : getMessageArticleClassName(message);

  return (
    <div
      ref={(element) => setUserMessageRef(message.id, element)}
      className={wrapperClassName}
    >
      <div className={containerClassName}>
        {hasDocuments ? (
          <DocumentAttachmentChips attachments={message.attachments} />
        ) : null}
        {hasImages ? (
          <ImageAttachmentCards
            align={isContextVariant ? "start" : "end"}
            attachments={message.attachments}
          />
        ) : null}
        {hasBubbleContent ? (
          <article className={articleClassName}>
            <UserPromptBody
              draftContent={draftContent}
              isContextVariant={isContextVariant}
              isEditing={isEditing}
              message={message}
              onCancelEdit={() => setDraftContent(null)}
              onDraftChange={setDraftContent}
              onSubmit={handleSubmit}
            />
          </article>
        ) : null}
        {!isEditing && showActions ? (
          <div className="flex h-6 items-center justify-end gap-2 pr-1 text-chat-fg-muted opacity-80 transition-opacity group-hover:opacity-100">
            <time
              className="text-xs tabular-nums opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              dateTime={message.createdAt}
            >
              {sentAt}
            </time>
            <div className="flex items-center gap-1">
              <Button
                aria-label={t("previousMessage.copy")}
                className="size-6 text-chat-fg-muted hover:bg-transparent hover:text-chat-fg"
                onClick={handleCopy}
                size="icon-xs"
                title={t("previousMessage.copy")}
                type="button"
                variant="ghost"
              >
                {hasCopied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
              {canEdit ? (
                <Button
                  aria-label={t("previousMessage.edit")}
                  className="size-6 text-chat-fg-muted hover:bg-transparent hover:text-chat-fg"
                  onClick={() => setDraftContent(message.content)}
                  size="icon-xs"
                  title={t("previousMessage.edit")}
                  type="button"
                  variant="ghost"
                >
                  <Pencil className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

const AssistantMessageActions = memo(function AssistantMessageActions({
  contentRef,
  message,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  message: MessageRecord;
}) {
  const { t } = useTranslation("agent");
  const turnStats = useAtomValue(turnStatsByMessageAtom)[message.id];
  const [hasCopied, setHasCopied] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const sentAt = formatMessageTime(message.createdAt);
  const durationText = turnStats
    ? formatDurationMs(turnStats.durationMs)
    : null;
  const hasTokenUsage = getTurnTokenCounts(turnStats?.usage) != null;

  const handleCopyMarkdown = () => {
    void navigator.clipboard
      .writeText(message.content)
      .then(() => {
        setHasCopied(true);
        window.setTimeout(() => setHasCopied(false), 1200);
      })
      .catch(() => {});
  };

  const copyRendered = () => {
    void copyRenderedMessage(contentRef.current, message.content).catch(
      () => {},
    );
    setCopyMenuOpen(false);
  };

  return (
    <div className="mt-2 flex h-6 items-center gap-2 text-chat-fg-muted opacity-80 transition-opacity group-hover:opacity-100">
      <DropdownMenu onOpenChange={setCopyMenuOpen} open={copyMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("assistantMessage.copy")}
            className="size-6 text-chat-fg-muted hover:bg-transparent hover:text-chat-fg"
            disabled={!message.content.trim()}
            onClick={handleCopyMarkdown}
            onContextMenu={(event) => {
              event.preventDefault();
              setCopyMenuOpen(true);
            }}
            onPointerDown={(event) => {
              if (event.button === 0) {
                event.preventDefault();
              }
            }}
            size="icon-xs"
            title={t("assistantMessage.copy")}
            type="button"
            variant="ghost"
          >
            {hasCopied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <AppDropdownContent side="top">
          <DropdownMenuGroup>
            <AppDropdownItem className="font-medium" onClick={copyRendered}>
              {t("assistantMessage.copyRichText")}
            </AppDropdownItem>
          </DropdownMenuGroup>
        </AppDropdownContent>
      </DropdownMenu>
      {durationText || hasTokenUsage ? (
        <span className="flex items-center gap-1 text-xs tabular-nums text-chat-fg-muted">
          {durationText ? <span>{durationText}</span> : null}
          {durationText && hasTokenUsage ? (
            <span aria-hidden="true">·</span>
          ) : null}
          <TurnTokenUsage usage={turnStats?.usage} />
        </span>
      ) : null}
      <time
        className="text-xs tabular-nums opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        dateTime={message.createdAt}
      >
        {sentAt}
      </time>
    </div>
  );
});

const MessageArticle = memo(function MessageArticle({
  isRunning,
  isStreamingLatest,
  message,
  showActions = true,
}: {
  isRunning: boolean;
  isStreamingLatest: boolean;
  message: MessageRecord;
  showActions?: boolean;
}) {
  const renderStartedAt = performance.now();
  const { t } = useTranslation("agent");
  const filePathHandlers = useMessageFilePathHandlers();
  const isSystem = message.role === "system";
  const isReasoning = isReasoningMessage(message);
  // Being the latest message only means nothing came after it — the turn may
  // have ended (or died) there. Reasoning is still live only while the session
  // is running, same gate the assistant body below uses.
  const isReasoningStreaming = isRunning && isStreamingLatest;
  const { activityDisplay } = useAtomValue(chatDisplaySettingsAtom);
  const turnChangeSet = useTurnChangeSet(message.id);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const articleClassName = getMessageArticleClassName(message);
  const showAssistantActions =
    showActions &&
    message.role === "assistant" &&
    !isReasoning &&
    !(isRunning && isStreamingLatest);
  const messageClassName = cn(
    "flex w-full min-w-0",
    message.role === "user" ? "justify-end" : "justify-start",
  );

  useLayoutEffect(() => {
    logSessionSwitchPerf(message.sessionId, "message-article-commit", {
      contentLength: message.content.length,
      isStreamingLatest,
      kind: message.kind ?? null,
      messageId: message.id,
      renderToCommitMs: Math.round(performance.now() - renderStartedAt),
      role: message.role,
    });
  }, [
    isStreamingLatest,
    message.content.length,
    message.id,
    message.kind,
    message.role,
    message.sessionId,
    renderStartedAt,
  ]);

  if (isReasoning && activityDisplay === "hidden") {
    return null;
  }

  return (
    <div className={messageClassName}>
      <div className="group w-full min-w-0 max-w-3xl">
        <article className={articleClassName}>
          {isSystem ? (
            <div className="mb-1.5 text-meta font-medium uppercase tracking-[0.18em] text-chat-system-muted">
              {t("system")}
            </div>
          ) : null}
          <MessageAttachments message={message} />
          {isReasoning ? (
            <ReasoningMarkdown
              isStreaming={isReasoningStreaming}
              message={message}
              mode={activityDisplay === "expanded" ? "full" : "collapsed"}
              streaming={isReasoningStreaming}
            />
          ) : (
            <div ref={contentRef}>
              <MarkdownRenderer
                className={
                  message.role === "assistant" ? "space-y-2" : "space-y-1.5"
                }
                content={message.content}
                filePathHandlers={
                  message.role === "assistant" ? filePathHandlers : undefined
                }
                perfMessageId={message.id}
                perfSessionId={message.sessionId}
                streaming={
                  message.role === "assistant" && isRunning && isStreamingLatest
                }
                tone={
                  message.role === "assistant"
                    ? "assistant"
                    : message.role === "system"
                      ? "system"
                      : "user"
                }
              />
            </div>
          )}
        </article>
        {turnChangeSet && !isReasoning ? (
          <TurnChangesCard
            changeSet={turnChangeSet}
            isStreaming={isRunning && isStreamingLatest}
          />
        ) : null}
        {showAssistantActions ? (
          <AssistantMessageActions contentRef={contentRef} message={message} />
        ) : null}
      </div>
    </div>
  );
});

function getActivitySegmentSummary(items: TimelineGroup[]) {
  const toolCalls = items.flatMap((item) =>
    item.kind === "toolCalls" ? item.toolCalls : [],
  );
  const reasoningCount = items.filter(
    (item) => item.kind === "message" && isReasoningMessage(item.message),
  ).length;

  return {
    isBusy: toolCalls.some(
      (toolCall) =>
        toolCall.status === "pending" || toolCall.status === "in_progress",
    ),
    reasoningCount,
    toolCount: toolCalls.length,
  };
}

export const ChatConversationItem = memo(function ChatConversationItem({
  activity,
  conversationGroup,
  isLatestConversation,
  isRunning,
  latestMessageId,
  onOpenToolLocation,
  onSubmitPromptEdit,
  onAnswerQuestion,
  onResolvePermission,
  setUserMessageRef,
  showMessageActions = true,
  promptVariant = "chat",
}: {
  // History conversation items don't render an ActivityLine (only the latest
  // conversation does, gated by isLatestConversation && isRunning). Marking
  // this optional lets the parent skip passing the unstable activity object,
  // which would otherwise defeat React.memo on every streaming token.
  activity?: ActivityState;
  conversationGroup: ConversationGroup;
  isLatestConversation: boolean;
  isRunning: boolean;
  latestMessageId: string | null;
  onOpenToolLocation?(location: ToolCallPreviewLocation): void;
  onSubmitPromptEdit?(message: MessageRecord, content: string): void;
  onAnswerQuestion?(
    question: AgentQuestionRequestRecord,
    answer: string,
  ): Promise<void> | void;
  onResolvePermission?(
    requestId: string,
    decision: AgentPermissionDecision,
  ): Promise<void> | void;
  setUserMessageRef(id: string, element: HTMLDivElement | null): void;
  showMessageActions?: boolean;
  promptVariant?: "chat" | "context";
}) {
  const renderStartedAt = isPerfEnabled() ? performance.now() : 0;
  const perfSessionId = getConversationSessionId(conversationGroup);
  const visibleItems = getVisibleConversationItems(conversationGroup);
  const showActivity = isRunning && isLatestConversation;
  const { activityDisplay } = useAtomValue(chatDisplaySettingsAtom);
  const segments = segmentConversationItems(
    visibleItems,
    activityDisplay === "condensed",
  );

  const renderTimelineItem = (group: TimelineGroup, nested = false) => {
    if (group.kind === "toolCalls") {
      return (
        <ToolCallGroup
          key={group.id}
          nested={nested}
          onOpenToolLocation={onOpenToolLocation}
          toolCalls={group.toolCalls as AgentToolCallRecord[]}
        />
      );
    }

    if (group.kind === "permission") {
      return (
        <PermissionCard
          key={group.id}
          onResolve={onResolvePermission}
          permission={group.permission}
        />
      );
    }

    if (group.kind === "question") {
      if (group.question.status === "pending") {
        return null;
      }

      return (
        <QuestionCard
          key={group.id}
          onAnswer={onAnswerQuestion}
          question={group.question}
        />
      );
    }

    return (
      <MessageArticle
        isRunning={isRunning}
        isStreamingLatest={group.message.id === latestMessageId}
        key={group.id}
        message={group.message}
        showActions={showMessageActions}
      />
    );
  };

  useLayoutEffect(() => {
    if (!isPerfEnabled() || !perfSessionId) {
      return;
    }

    logSessionSwitchPerf(perfSessionId, "conversation-item-commit", {
      conversationId: conversationGroup.id,
      hasPrompt: Boolean(conversationGroup.prompt),
      isLatestConversation,
      renderToCommitMs: Math.round(performance.now() - renderStartedAt),
      visibleItemCount: visibleItems.length,
    });
  }, [
    conversationGroup.id,
    conversationGroup.prompt,
    isLatestConversation,
    perfSessionId,
    renderStartedAt,
    visibleItems.length,
  ]);

  return (
    <div className="flex flex-col gap-1.5 pb-4 px-2">
      {conversationGroup.prompt ? (
        <UserPrompt
          canEdit={!isRunning && !isLatestConversation}
          message={conversationGroup.prompt}
          onSubmitEdit={onSubmitPromptEdit}
          setUserMessageRef={setUserMessageRef}
          showActions={showMessageActions}
          variant={promptVariant}
        />
      ) : null}

      {visibleItems.length > 0 || showActivity ? (
        <div className="flex flex-col gap-1">
          {segments.map((segment, index) => {
            if (segment.kind === "item") {
              return renderTimelineItem(segment.item);
            }

            const summary = getActivitySegmentSummary(segment.items);
            const isLiveTail = showActivity && index === segments.length - 1;

            return (
              <ActivityBlock
                busy={summary.isBusy || isLiveTail}
                key={segment.items[0]?.id ?? "activity"}
                reasoningCount={summary.reasoningCount}
                toolCount={summary.toolCount}
              >
                {segment.items.map((item) => renderTimelineItem(item, true))}
              </ActivityBlock>
            );
          })}
          {showActivity && activity ? (
            <ActivityLine activity={activity} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
