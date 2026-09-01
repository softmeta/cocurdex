import {
  type ImageAttachment,
  isImageAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import { Image, X } from "lucide-react";
import type { ImportImageAttachmentPayload } from "@/lib";
import { cn, desktopApi } from "@/lib";
import {
  COMPOSER_IMAGE_CARD_MAX_HEIGHT,
  COMPOSER_IMAGE_CARD_MAX_WIDTH,
  getImageCardSize,
} from "./image-attachment-card-size";
import { useImageDataUrl } from "./image-attachment-hooks";

export { ImageAttachmentPreview } from "./image-attachment-preview";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES_PER_MESSAGE = 6;

export function getImageAttachmentLimitError() {
  return "Attach up to 6 images per message.";
}

export function getImageAttachmentValidationError(file: File) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return "Only PNG, JPEG, GIF, or WebP images are supported.";
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return "Images must be 10 MB or smaller.";
  }

  return null;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read image"));
        return;
      }

      resolve(reader.result);
    };

    reader.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl: string) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const image = document.createElement("img");

    image.onerror = () => reject(new Error("Unable to decode image"));
    image.onload = () => {
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.src = dataUrl;
  });
}

async function fileToPayload(
  file: File,
): Promise<ImportImageAttachmentPayload> {
  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await getImageDimensions(dataUrl);

  return {
    dataUrl,
    height: dimensions.height,
    mimeType: file.type,
    name: file.name,
    sizeBytes: file.size,
    width: dimensions.width,
  };
}

export async function importImageDataUrl(dataUrl: string, name: string) {
  const match = /^data:([^;,]+);base64,/u.exec(dataUrl);
  if (!match) {
    throw new Error("Image data must be a base64 data URL");
  }

  const mimeType = match[1];
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("Only PNG, JPEG, GIF, or WebP images are supported.");
  }

  const dimensions = await getImageDimensions(dataUrl);
  const sizeBytes = Math.floor((dataUrl.length * 3) / 4);

  return desktopApi.importImageAttachment({
    dataUrl,
    height: dimensions.height,
    mimeType,
    name,
    sizeBytes,
    width: dimensions.width,
  });
}

export async function importImageFiles(files: File[]) {
  const imageAttachments: ImageAttachment[] = [];

  for (const file of files) {
    const payload = await fileToPayload(file);
    imageAttachments.push(await desktopApi.importImageAttachment(payload));
  }

  return imageAttachments;
}

export function filterSupportedImageFiles(files: File[]) {
  return files.filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type));
}

export function canAddImageAttachments(
  attachments: MessageAttachment[],
  nextImageCount: number,
) {
  const currentImageCount = attachments.filter(isImageAttachment).length;
  return currentImageCount + nextImageCount <= MAX_IMAGES_PER_MESSAGE;
}

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
