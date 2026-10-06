import {
  type ContextAttachment,
  formatContextFileChipLabel,
  getContextAttachmentKey,
  isContextAttachment,
  isContextFolderAttachment,
  isContextItemAttachment,
  type MessageRecord,
  pathBaseName,
} from "@cocurdex/shared";
import { Brain, FileText, ListTodo, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon, LinkifiedText, MarkdownRenderer } from "@/components";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui";
import { openContextItem } from "@/lib";
import { splitContentByMentions } from "./chat-message-utils";

function getContextAttachmentLabel(attachment: ContextAttachment) {
  if (isContextItemAttachment(attachment)) {
    return attachment.title;
  }
  if (isContextFolderAttachment(attachment)) {
    return pathBaseName(attachment.folderPath);
  }

  return formatContextFileChipLabel(attachment);
}

// Match the composer's inline mention pill: coloured file-type icon and
// link-toned label, no border/background box. `min-h-[1lh]` matches the
// surrounding `text-sm` line box so the icon, filename, and adjacent text
// share one vertical center.
function ContextAttachmentIcon({
  attachment,
}: {
  attachment: ContextAttachment;
}) {
  if (isContextItemAttachment(attachment)) {
    const Icon = attachment.itemKind === "issue" ? ListTodo : FileText;
    return <Icon className="block size-full" />;
  }
  const isFolder = isContextFolderAttachment(attachment);
  return (
    <FileTypeIcon
      className="block size-full"
      isFolder={isFolder}
      path={isFolder ? attachment.folderPath : attachment.filePath}
    />
  );
}

function ContextAttachmentChipContent({
  attachment,
}: {
  attachment: ContextAttachment;
}) {
  return (
    <>
      <span className="inline-flex size-[1em] shrink-0 items-center justify-center">
        <ContextAttachmentIcon attachment={attachment} />
      </span>
      <span className="min-w-0 truncate leading-none">
        {getContextAttachmentLabel(attachment)}
      </span>
    </>
  );
}

function renderAttachmentChip(attachment: ContextAttachment) {
  const key = getContextAttachmentKey(attachment);
  if (isContextItemAttachment(attachment)) {
    return (
      <button
        className="mention-pill inline-flex min-h-[1lh] max-w-full cursor-pointer items-center gap-1 text-chat-link hover:text-chat-link-hover hover:underline"
        key={key}
        onClick={() => openContextItem(attachment)}
        type="button"
      >
        <ContextAttachmentChipContent attachment={attachment} />
      </button>
    );
  }
  return (
    <span
      className="mention-pill inline-flex min-h-[1lh] max-w-full items-center gap-1 text-chat-link"
      key={key}
    >
      <ContextAttachmentChipContent attachment={attachment} />
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
      <span className="min-w-0">
        <LinkifiedText text={text} />
      </span>
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

function getReasoningPreview(content: string) {
  return content
    .slice(0, 240)
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ReasoningTriggerRow({
  isStreaming,
  label,
  preview,
}: {
  isStreaming: boolean;
  label: string;
  preview: string;
}) {
  return (
    <>
      {isStreaming ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-chat-fg-muted" />
      ) : (
        <Brain className="size-3.5 shrink-0 text-chat-fg-muted" />
      )}
      <span className="shrink-0">{label}</span>
      {preview ? (
        <span className="min-w-0 truncate font-normal text-chat-fg-muted group-data-[panel-open]/reasoning:hidden">
          {preview}
        </span>
      ) : null}
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
      className="space-y-1.5 [&_li]:text-body [&_li]:text-chat-fg-muted [&_p]:text-body [&_p]:text-chat-fg-muted"
      content={message.content}
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
  // Row geometry is shared with the tool-call rows (px-1.5 py-1 gap-2, text-body,
  // size-3.5 icon) so every icon in the activity log sits in one column. The
  // expansion aligns with the trigger's label: padding (6) + brain (14) +
  // gap-2 (8) = 28px. No guide line, matching the tool-call detail.
  return (
    <Collapsible
      className="flex w-full flex-col gap-1.5"
      defaultOpen={mode === "full"}
    >
      <CollapsibleTrigger className="group/reasoning flex w-full min-w-0 items-center gap-2 rounded-control px-1.5 py-1 text-left font-medium text-chat-fg-muted text-body">
        <ReasoningTriggerRow
          isStreaming={isStreaming}
          label={label}
          preview={getReasoningPreview(message.content)}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="ms-7 text-chat-fg-secondary">
        {body}
      </CollapsibleContent>
    </Collapsible>
  );
}
