import {
  type ContextFileAttachment,
  type ContextFolderAttachment,
  formatContextFileChipLabel,
  isContextAttachment,
  isContextFolderAttachment,
  type MessageAttachment,
  type MessageRecord,
} from "@cocurdex/shared";
import { Brain, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon, MarkdownRenderer } from "@/components";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui";
import {
  isAssistantEchoOfPrompt,
  isReasoningMessage,
  splitContentByMentions,
} from "./chat-message-utils";

export { isAssistantEchoOfPrompt, isReasoningMessage };

export type StickyUserMessage = {
  id: string;
  attachments: MessageAttachment[];
  content: string;
};

function getContextAttachmentLabel(
  attachment: ContextFileAttachment | ContextFolderAttachment,
) {
  if (isContextFolderAttachment(attachment)) {
    return attachment.folderPath.split("/").pop() ?? attachment.folderPath;
  }

  return formatContextFileChipLabel(attachment);
}

function getContextAttachmentKey(
  attachment: ContextFileAttachment | ContextFolderAttachment,
) {
  if (isContextFolderAttachment(attachment)) {
    return `folder:${attachment.folderPath}`;
  }

  return `file:${attachment.filePath}:${attachment.startLine}:${attachment.endLine}`;
}

// Match the composer's inline mention pill: coloured file-type icon and
// link-toned label, no border/background box. `min-h-[1lh]` matches the
// surrounding `text-sm` line box so the icon, filename, and adjacent text
// share one vertical center.
function renderAttachmentChip(
  attachment: ContextFileAttachment | ContextFolderAttachment,
) {
  const isFolder = isContextFolderAttachment(attachment);
  const path = isFolder ? attachment.folderPath : attachment.filePath;

  return (
    <span
      className="mention-pill inline-flex min-h-[1lh] max-w-full items-center gap-1 text-chat-link"
      key={getContextAttachmentKey(attachment)}
    >
      <span className="inline-flex size-[1em] shrink-0 items-center justify-center">
        <FileTypeIcon
          className="block size-full"
          isFolder={isFolder}
          path={path}
        />
      </span>
      <span className="min-w-0 truncate leading-none">
        {getContextAttachmentLabel(attachment)}
      </span>
    </span>
  );
}

export function MessageAttachments({ message }: { message: MessageRecord }) {
  if (message.attachments.length === 0 || message.role === "user") {
    return null;
  }

  const contextAttachments = message.attachments.filter(isContextAttachment);

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {contextAttachments.map((attachment) => renderAttachmentChip(attachment))}
    </div>
  );
}

// A single plain-text run of a user message. Runs have no stable identity of
// their own — their position in the message body is the identity — so callers
// key them by index. `min-h-[1lh]` matches the surrounding `text-sm` line box
// so the run and adjacent mention chips share one vertical center.
function MessageTextRun({ text }: { text: string }) {
  return (
    <span className="inline-flex min-h-[1lh] min-w-0 max-w-full items-center whitespace-pre-wrap wrap-break-word">
      {text}
    </span>
  );
}

export function UserMessageContent({ message }: { message: MessageRecord }) {
  const contextAttachments = message.attachments.filter(isContextAttachment);
  const { leadingAttachments, segments } = splitContentByMentions(
    message.content,
    contextAttachments,
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-start text-sm text-chat-fg">
      {leadingAttachments.map((attachment) => renderAttachmentChip(attachment))}
      {segments.map((segment, index) =>
        segment.kind === "mention" ? (
          renderAttachmentChip(segment.attachment)
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional text run
          <MessageTextRun key={index} text={segment.text} />
        ),
      )}
    </div>
  );
}

function ReasoningTriggerRow({
  isStreaming,
  label,
}: {
  isStreaming: boolean;
  label: string;
}) {
  return (
    <>
      {isStreaming ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-chat-fg-muted" />
      ) : (
        <Brain className="size-3.5 shrink-0 text-chat-fg-muted" />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </>
  );
}

function ReasoningDetailBody({
  message,
  streaming,
}: {
  message: MessageRecord;
  streaming: boolean;
}) {
  return (
    <MarkdownRenderer
      className="space-y-2"
      content={message.content}
      perfMessageId={message.id}
      perfSessionId={message.sessionId}
      streaming={streaming}
      tone="editor"
    />
  );
}

export function ReasoningMarkdown({
  isStreaming,
  message,
  mode = "collapsed",
  streaming,
}: {
  isStreaming: boolean;
  message: MessageRecord;
  mode?: "collapsed" | "full";
  streaming: boolean;
}) {
  const { t } = useTranslation("agent");
  const label = isStreaming ? t("thinking") : t("reasoning");
  const body = <ReasoningDetailBody message={message} streaming={streaming} />;

  // Both modes render the reasoning inline so the detail joins the document flow
  // and pushes the response down, rather than floating over it in a popover or
  // sheet that overlaps adjacent content. The only difference is the initial
  // state: full (expanded) mode opens by default but still exposes a collapse
  // toggle, while collapsed mode starts behind a click-to-expand trigger.
  //
  // The expansion aligns with the trigger's label (brain icon): chevron (14) +
  // gap-2 (8) = 22px. No guide line, matching the tool-call detail.
  return (
    <Collapsible
      className="flex w-full flex-col gap-1.5"
      defaultOpen={mode === "full"}
    >
      <CollapsibleTrigger className="inline-flex max-w-full items-center gap-2 rounded-control py-1 text-left font-medium text-chat-fg-muted text-sm">
        <ReasoningTriggerRow isStreaming={isStreaming} label={label} />
      </CollapsibleTrigger>
      <CollapsibleContent className="ms-5.5 text-chat-fg-secondary">
        {body}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function StickyUserMessageBar({
  attachments,
  content,
  onClick,
}: StickyUserMessage & { onClick(): void }) {
  const contextAttachments = attachments.filter(isContextAttachment);

  return (
    <button
      className="sticky-user-bar-enter block w-full rounded-card rounded-tr-md border border-chat-border-soft bg-chat-surface-bubble px-3 py-2 text-left text-chat-fg shadow-chat-soft"
      onClick={onClick}
      type="button"
    >
      {/* Single-line preview: the overlay only hints which prompt is being
          read, so chips and text stay on one row (no wrap) and clip — this also
          keeps the heading-anchor scroll offset (--md-anchor-offset) stable. */}
      <div className="flex items-center gap-2 overflow-hidden">
        {contextAttachments.map((attachment) =>
          renderAttachmentChip(attachment),
        )}
        <div className="min-w-0 flex-1 truncate text-sm text-chat-fg">
          {content}
        </div>
      </div>
    </button>
  );
}
