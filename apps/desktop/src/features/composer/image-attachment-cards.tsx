import {
  type ImageAttachment,
  isImageAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import { Image } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib";
import { getImageCardSize } from "./image-attachment-card-size";
import { useImageDataUrl } from "./image-attachment-hooks";
import { ImageAttachmentPreview } from "./image-attachment-preview";

function MessageImageCard({
  alt,
  height = 0,
  onClick,
  src,
  width = 0,
}: {
  alt: string;
  height?: number;
  onClick(): void;
  src: string | null;
  width?: number;
}) {
  const displaySize = getImageCardSize(width, height);

  return (
    <button
      aria-label={alt}
      className="block cursor-pointer overflow-hidden rounded-card border border-chat-border-soft bg-chat-surface-subtle shadow-chat-soft"
      onClick={onClick}
      style={displaySize ?? undefined}
      type="button"
    >
      {src ? (
        <img
          alt={alt}
          className={cn(
            "block",
            displaySize && "size-full object-cover",
            !displaySize && "h-auto max-h-48 w-auto max-w-40 object-contain",
          )}
          src={src}
        />
      ) : (
        <span className="flex size-28 items-center justify-center">
          <Image className="size-5 text-chat-fg-muted" />
        </span>
      )}
    </button>
  );
}

function ResolvedImageCard({
  attachment,
  onClick,
}: {
  attachment: ImageAttachment;
  onClick(): void;
}) {
  const dataUrl = useImageDataUrl(attachment);

  return (
    <MessageImageCard
      alt={attachment.name}
      height={attachment.height}
      onClick={onClick}
      src={dataUrl}
      width={attachment.width}
    />
  );
}

// Standalone photo cards for a sent user message. Kept outside the text
// bubble so an image + caption reads as two bubbles, like a typical IM.
export function ImageAttachmentCards({
  align = "end",
  attachments,
}: {
  align?: "start" | "end";
  attachments: MessageAttachment[];
}) {
  const [previewAttachment, setPreviewAttachment] =
    useState<ImageAttachment | null>(null);
  const imageAttachments = attachments.filter(isImageAttachment);

  if (imageAttachments.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          "flex max-w-full flex-wrap gap-2",
          align === "end" && "justify-end",
          align === "start" && "justify-start",
        )}
      >
        {imageAttachments.map((attachment) => (
          <ResolvedImageCard
            attachment={attachment}
            key={attachment.id}
            onClick={() => setPreviewAttachment(attachment)}
          />
        ))}
      </div>
      {previewAttachment ? (
        <ImageAttachmentPreview
          attachment={previewAttachment}
          gallery={imageAttachments}
          onClose={() => setPreviewAttachment(null)}
          onSelect={setPreviewAttachment}
        />
      ) : null}
    </>
  );
}
