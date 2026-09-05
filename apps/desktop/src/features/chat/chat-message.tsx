import type {
  ConversationImagePart,
  ConversationMessageRecord,
  ImageAttachment,
} from "@cocurdex/shared";
import { Check, Copy, Pencil, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CollapsibleUserMessageBody, MarkdownRenderer } from "@/components";
import { Button, Spinner, Textarea } from "@/components/ui";
import { ImageAttachmentCards } from "@/features/composer";
import { cn } from "@/lib";
import { formatMessageTime, formatUsage } from "./chat-message-format";
import { ConversationMessageStatus } from "./chat-message-status";
import { MessageSources } from "./message-sources";

function conversationImageToAttachment(
  part: ConversationImagePart,
  key: string,
  name: string,
): ImageAttachment {
  return {
    kind: "image",
    id: key,
    name,
    mimeType: part.mimeType ?? "image/png",
    sizeBytes: 0,
    filePath: part.image,
    width: 0,
    height: 0,
  };
}

function ConversationMessageText({
  combinedText,
  isAssistant,
  isStreaming,
}: {
  combinedText: string;
  isAssistant: boolean;
  isStreaming: boolean;
}) {
  if (!combinedText) {
    return null;
  }

  if (isAssistant) {
    return (
      <MarkdownRenderer
        className="space-y-2"
        content={combinedText}
        streaming={isStreaming}
        tone="assistant"
      />
    );
  }

  return (
    <CollapsibleUserMessageBody text={combinedText}>
      <div className="whitespace-pre-wrap break-words">{combinedText}</div>
    </CollapsibleUserMessageBody>
  );
}

interface ConversationMessageProps {
  message: ConversationMessageRecord;
  canEdit?: boolean;
  canRetry?: boolean;
  busy?: boolean;
  onEdit?(messageId: string, text: string): void;
  onRetry?(messageId: string): void;
}

// Match the agent-chat layout: user messages stay in a right-aligned bubble,
// while assistant messages render as borderless markdown blocks for parity
// with the agent transcript style. Edit/retry actions mirror agent prompt
// controls (inline textarea + pencil) without the workspace-checkpoint flow.
export function ConversationMessage({
  message,
  canEdit = false,
  canRetry = false,
  busy = false,
  onEdit,
  onRetry,
}: ConversationMessageProps) {
  const { t } = useTranslation("chat");
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isStreaming = message.status === "streaming";
  const isErrored = message.status === "errored";
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const isEditing = draftContent !== null;

  const textParts = message.content.filter(
    (part): part is { type: "text"; text: string } => part.type === "text",
  );
  const imageParts = message.content.filter(
    (part): part is { type: "image"; image: string; mimeType?: string } =>
      part.type === "image",
  );

  const combinedText = textParts.map((p) => p.text).join("");
  const imageAlt = t("message.imageAlt", { defaultValue: "Attached image" });
  const imageAttachments = imageParts.map((part, index) =>
    conversationImageToAttachment(
      part,
      `${message.id}-image-${index}`,
      imageAlt,
    ),
  );
  const showCopy = combinedText.length > 0 && !isStreaming && !isEditing;
  const usageText = formatUsage(message.usage);
  const showRetry =
    isAssistant && canRetry && !busy && !isStreaming && Boolean(onRetry);
  const showEdit =
    isUser && canEdit && !busy && !isStreaming && Boolean(onEdit);
  const hasBubbleContent =
    isEditing ||
    Boolean(combinedText) ||
    (isStreaming && isAssistant) ||
    (isAssistant && message.sources.length > 0) ||
    isErrored ||
    message.status === "cancelled" ||
    (!isUser && imageParts.length > 0);

  const handleSubmitEdit = () => {
    const content = draftContent?.trim() ?? "";
    if (!content && imageParts.length === 0) {
      return;
    }
    onEdit?.(message.id, content);
    setDraftContent(null);
  };

  return (
    <div
      className={cn(
        "flex w-full min-w-0",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "group flex flex-col text-body",
          isUser
            ? "min-w-0 max-w-[88%] items-end gap-1.5"
            : "w-full min-w-0 max-w-3xl items-start gap-1",
        )}
      >
        {isUser && imageAttachments.length > 0 ? (
          <ImageAttachmentCards attachments={imageAttachments} />
        ) : null}
        {hasBubbleContent ? (
          <div
            className={cn(
              isUser
                ? cn(
                    "rounded-panel rounded-tr-md border border-chat-border-soft",
                    "bg-chat-surface-bubble px-3.5 py-2.5 text-chat-fg",
                  )
                : "w-full min-w-0 text-foreground",
            )}
          >
            {!isUser && imageParts.length > 0 ? (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {imageParts.map((part) => (
                  <img
                    key={part.image}
                    src={part.image}
                    alt={t("message.imageAlt", {
                      defaultValue: "Attached image",
                    })}
                    className="rounded-control border border-border object-cover"
                  />
                ))}
              </div>
            ) : null}

            {isEditing ? (
              <div className="flex min-w-72 flex-col gap-2">
                <Textarea
                  autoFocus
                  className="max-h-72 min-h-24 resize-y text-sm"
                  onChange={(event) => setDraftContent(event.target.value)}
                  value={draftContent}
                />
                <div className="flex justify-end gap-1.5">
                  <Button
                    aria-label={t("message.cancelEdit", {
                      defaultValue: "Cancel edit",
                    })}
                    onClick={() => setDraftContent(null)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <X className="size-3.5" />
                  </Button>
                  <Button
                    aria-label={t("message.submitEdit", {
                      defaultValue: "Submit edit",
                    })}
                    disabled={!draftContent.trim() && imageParts.length === 0}
                    onClick={handleSubmitEdit}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Check className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <ConversationMessageText
                combinedText={combinedText}
                isAssistant={isAssistant}
                isStreaming={isStreaming}
              />
            )}

            {isStreaming && isAssistant && combinedText === "" ? (
              <Spinner className="size-4" />
            ) : null}

            {isAssistant && message.sources.length > 0 ? (
              <MessageSources sources={message.sources} />
            ) : null}

            <ConversationMessageStatus message={message} />
          </div>
        ) : null}
        {showCopy || showEdit || showRetry ? (
          <div
            className={cn(
              "flex h-6 items-center gap-2 text-chat-fg-muted opacity-80 transition-opacity group-hover:opacity-100",
              isUser ? "flex-row-reverse" : "flex-row",
            )}
          >
            {showCopy ? <CopyMessageButton content={combinedText} /> : null}
            {showEdit ? (
              <Button
                aria-label={t("message.edit", { defaultValue: "Edit" })}
                className="size-6 text-chat-fg-muted hover:bg-transparent hover:text-chat-fg"
                onClick={() => setDraftContent(combinedText)}
                size="icon-xs"
                title={t("message.edit", { defaultValue: "Edit" })}
                type="button"
                variant="ghost"
              >
                <Pencil className="size-3.5" />
              </Button>
            ) : null}
            {showRetry ? (
              <Button
                aria-label={
                  isErrored
                    ? t("message.retry", { defaultValue: "Retry" })
                    : t("message.regenerate", { defaultValue: "Regenerate" })
                }
                className="size-6 text-chat-fg-muted hover:bg-transparent hover:text-chat-fg"
                onClick={() => onRetry?.(message.id)}
                size="icon-xs"
                title={
                  isErrored
                    ? t("message.retry", { defaultValue: "Retry" })
                    : t("message.regenerate", { defaultValue: "Regenerate" })
                }
                type="button"
                variant="ghost"
              >
                <RefreshCw className="size-3.5" />
              </Button>
            ) : null}
            {isAssistant && usageText ? (
              <span className="text-xs tabular-nums text-chat-fg-muted">
                {usageText}
              </span>
            ) : null}
            {showCopy ? (
              <time
                className="text-xs tabular-nums opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                dateTime={message.createdAt}
              >
                {formatMessageTime(message.createdAt)}
              </time>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CopyMessageButton({ content }: { content: string }) {
  const { t } = useTranslation("chat");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(content)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  const label = t("message.copy", { defaultValue: "Copy" });

  return (
    <Button
      aria-label={label}
      className="size-6 text-chat-fg-muted hover:bg-transparent hover:text-chat-fg"
      onClick={handleCopy}
      size="icon-xs"
      title={label}
      type="button"
      variant="ghost"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}
