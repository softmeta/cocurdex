import { isDocumentAttachment, type MessageAttachment } from "@cocurdex/shared";
import { FileText, X } from "lucide-react";
import { cn } from "@/lib";

export function DocumentAttachmentChips({
  attachments,
  onRemoveAttachment,
  removeAttachmentLabel,
  tone = "chat",
}: {
  attachments: MessageAttachment[];
  onRemoveAttachment?(index: number): void;
  removeAttachmentLabel?: string;
  tone?: "chat" | "welcome";
}) {
  const documents = attachments.flatMap((attachment, index) =>
    isDocumentAttachment(attachment) ? [{ attachment, index }] : [],
  );

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {documents.map(({ attachment, index }) => (
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-meta",
            tone === "welcome"
              ? "border-welcome-border bg-welcome-surface-strong text-welcome-fg-muted"
              : "border-chat-border bg-chat-surface-control text-chat-fg-muted",
          )}
          key={attachment.id}
        >
          <FileText className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{attachment.name}</span>
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
