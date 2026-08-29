import type {
  ContextFileAttachment,
  ContextFolderAttachment,
  MessageAttachment,
} from "@cocurdex/shared";
import { isContextAttachment } from "@cocurdex/shared";
import { FileText, X } from "lucide-react";
import { cn } from "@/lib";
import { getContextAttachmentMentionLabel } from "./context-file-mentions";

type ContextAttachment = ContextFileAttachment | ContextFolderAttachment;

export function ContextAttachmentChips({
  attachments,
  onRemoveAttachment,
  removeAttachmentLabel,
  tone = "chat",
}: {
  attachments: MessageAttachment[];
  onRemoveAttachment?(index: number): void;
  removeAttachmentLabel: string;
  tone?: "chat" | "welcome";
}) {
  const contextAttachments: Array<{
    attachment: ContextAttachment;
    index: number;
  }> = [];

  attachments.forEach((attachment, index) => {
    if (isContextAttachment(attachment)) {
      contextAttachments.push({ attachment, index });
    }
  });

  if (contextAttachments.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {contextAttachments.map(({ attachment, index }) => (
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-meta",
            tone === "welcome"
              ? "border-welcome-border bg-welcome-surface-strong text-welcome-fg-muted"
              : "border-chat-border bg-chat-surface-control text-chat-fg-muted",
          )}
          key={`${getContextAttachmentMentionLabel(attachment)}:${index}`}
        >
          <FileText className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {getContextAttachmentMentionLabel(attachment)}
          </span>
          {onRemoveAttachment ? (
            <button
              aria-label={removeAttachmentLabel}
              className="flex size-4 shrink-0 items-center justify-center rounded-full hover:text-foreground"
              onClick={() => onRemoveAttachment(index)}
              type="button"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}
