import {
  type ImageAttachment,
  isImageAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import { Image, X } from "lucide-react";
import { cn } from "@/lib";
import {
  COMPOSER_IMAGE_CARD_MAX_HEIGHT,
  COMPOSER_IMAGE_CARD_MAX_WIDTH,
  getImageCardSize,
} from "./image-attachment-card-size";
import { useImageDataUrl } from "./image-attachment-hooks";

export { ImageAttachmentPreview } from "./image-attachment-preview";

function ImageAttachmentThumbnail({
  attachment,
  onClick,
  onRemove,
  size = "card",
  tone = "chat",
}: {
  attachment: ImageAttachment;
  onClick?(attachment: ImageAttachment): void;
  onRemove?(): void;
  size?: "card" | "chip";
  tone?: "chat" | "welcome";
}) {
  const dataUrl = useImageDataUrl(attachment);
  const composerSize =
    size === "card"
      ? getImageCardSize(
          attachment.width,
          attachment.height,
          COMPOSER_IMAGE_CARD_MAX_WIDTH,
          COMPOSER_IMAGE_CARD_MAX_HEIGHT,
        )
      : null;
  const borderClassName =
    tone === "welcome" ? "border-welcome-border" : "border-chat-border";
  const removeClassName =
    tone === "welcome"
      ? "bg-welcome-surface-strong text-welcome-fg-muted hover:text-welcome-fg"
      : "bg-chat-surface-strong text-chat-fg-muted hover:text-chat-fg";

  return (
    <span
      className={cn(
        "group relative inline-flex overflow-hidden border bg-chat-surface-control shadow-chat-soft",
        size === "card" && "rounded-card",
        size === "card" &&
          !composerSize &&
          "h-16 w-28 items-center justify-center",
        size === "chip" && "size-16 rounded-control",
        borderClassName,
      )}
      style={composerSize ?? undefined}
      title={attachment.name}
    >
      <button
        aria-label={attachment.name}
        className={cn(
          "flex size-full items-center justify-center",
          onClick && "cursor-pointer",
        )}
        onClick={() => onClick?.(attachment)}
        type="button"
      >
        {dataUrl ? (
          <img
            alt={attachment.name}
            className="size-full object-cover"
            src={dataUrl}
          />
        ) : (
          <Image className="size-5 text-chat-fg-muted" />
        )}
      </button>
      {onRemove ? (
        <button
          aria-label={`Remove image ${attachment.name}`}
          className={cn(
            "absolute end-1 top-1 flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100",
            removeClassName,
          )}
          onClick={onRemove}
          type="button"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export function ImageAttachmentChips({
  attachments,
  onPreview,
  onRemoveAttachment,
  size,
  tone,
}: {
  attachments: MessageAttachment[];
  onPreview?(attachment: ImageAttachment): void;
  onRemoveAttachment?(index: number): void;
  size?: "card" | "chip";
  tone?: "chat" | "welcome";
}) {
  const imageAttachments = attachments.filter(isImageAttachment);
  if (imageAttachments.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {imageAttachments.map((attachment) => (
        <ImageAttachmentThumbnail
          attachment={attachment}
          key={attachment.id}
          onClick={onPreview}
          onRemove={
            onRemoveAttachment
              ? () => onRemoveAttachment(attachments.indexOf(attachment))
              : undefined
          }
          size={size}
          tone={tone}
        />
      ))}
    </div>
  );
}
