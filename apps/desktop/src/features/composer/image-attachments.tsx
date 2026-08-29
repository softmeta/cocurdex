import {
  type ImageAttachment,
  isImageAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import { Copy, Download, Image, Minus, Plus, RotateCw, X } from "lucide-react";
import type { ReactNode, WheelEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
  titlebarIconButtonClassName,
} from "@/app/layout/titlebar-icon-button";
import { Dialog, DialogContent, DialogTitle, Text } from "@/components/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ImportImageAttachmentPayload } from "@/lib";
import { cn, desktopApi } from "@/lib";
import {
  useImageDataUrl,
  useTemporaryImageCopyStatus,
} from "./image-attachment-hooks";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES_PER_MESSAGE = 6;
const MIN_PREVIEW_ZOOM = 0.5;
const MAX_PREVIEW_ZOOM = 3;
const PREVIEW_ZOOM_STEP = 0.25;
// Match PDF / panel toolbars: delay so sweeping the chrome does not flash tips.
const PREVIEW_TOOLBAR_TOOLTIP_DELAY_MS = 500;

function PreviewToolbarIconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <TitlebarIconButton
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </TitlebarIconButton>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

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
  tone = "chat",
}: {
  attachment: ImageAttachment;
  onClick?(attachment: ImageAttachment): void;
  onRemove?(): void;
  tone?: "chat" | "welcome";
}) {
  const dataUrl = useImageDataUrl(attachment);
  const borderClassName =
    tone === "welcome" ? "border-welcome-border" : "border-chat-border";
  const removeClassName =
    tone === "welcome"
      ? "bg-welcome-surface-strong text-welcome-fg-muted hover:text-welcome-fg"
      : "bg-chat-surface-strong text-chat-fg-muted hover:text-chat-fg";

  return (
    <span
      className={cn(
        "group relative inline-flex size-16 overflow-hidden rounded-control border bg-chat-surface-control shadow-chat-soft",
        borderClassName,
      )}
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
            "absolute right-1 top-1 flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100",
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

export function ImageAttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: ImageAttachment;
  onClose(): void;
}) {
  const { t } = useTranslation("agent");
  const dataUrl = useImageDataUrl(attachment);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copyStatus, showCopyStatus] = useTemporaryImageCopyStatus(1800);
  const zoomPercent = Math.round(zoom * 100);
  const canZoomOut = zoom > MIN_PREVIEW_ZOOM;
  const canZoomIn = zoom < MAX_PREVIEW_ZOOM;
  const isAtDefaultZoom = Math.abs(zoom - 1) < 0.005;
  const resetZoomLabel = t("imagePreview.resetZoom");

  const updateZoom = (nextZoom: number) => {
    setZoom(Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, nextZoom)));
  };

  const handleCopy = async () => {
    if (!dataUrl || typeof ClipboardItem === "undefined") {
      return;
    }

    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      showCopyStatus("copied");
    } catch {
      // Clipboard support varies by platform; preview remains usable without it.
      showCopyStatus("failed");
    }
  };

  const handleDownload = () => {
    if (!dataUrl) {
      return;
    }

    const link = document.createElement("a");
    link.download = attachment.name;
    link.href = dataUrl;
    link.click();
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    updateZoom(zoom + direction * PREVIEW_ZOOM_STEP);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        // Fixed card size (not full-viewport). Zoom uses transform so the
        // shell never grows with scale. flex-col so the stage can flex-1.
        className="flex h-[min(85dvh,40rem)] w-full flex-col gap-0 overflow-hidden rounded-panel border-chat-border bg-chat-surface p-0 text-chat-fg shadow-2xl"
        showCloseButton={false}
        size="wide"
      >
        <DialogTitle className="sr-only">{attachment.name}</DialogTitle>
        <TooltipProvider delay={PREVIEW_TOOLBAR_TOOLTIP_DELAY_MS}>
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-chat-border/40 border-b px-3">
            <div className="min-w-0">
              <Text className="block truncate text-chat-fg" size="body">
                {attachment.name}
              </Text>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {copyStatus ? (
                <output className="me-1">
                  <Text className="text-chat-fg-muted" size="meta">
                    {copyStatus === "copied"
                      ? t("imagePreview.copied")
                      : t("imagePreview.copyFailed")}
                  </Text>
                </output>
              ) : null}
              <PreviewToolbarIconButton
                disabled={!canZoomOut}
                label={t("imagePreview.zoomOut")}
                onClick={() => updateZoom(zoom - PREVIEW_ZOOM_STEP)}
              >
                <Minus className={TITLEBAR_ICON_GLYPH_CLASS} />
              </PreviewToolbarIconButton>
              {isAtDefaultZoom ? (
                <button
                  aria-label={resetZoomLabel}
                  className={cn(
                    titlebarIconButtonClassName(),
                    "h-6 w-auto min-w-10 px-1.5 tabular-nums",
                  )}
                  type="button"
                >
                  <Text size="meta">100%</Text>
                </button>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    aria-label={resetZoomLabel}
                    className={cn(
                      titlebarIconButtonClassName(),
                      "h-6 w-auto min-w-10 px-1.5 tabular-nums",
                    )}
                    onClick={() => updateZoom(1)}
                    type="button"
                  >
                    <Text size="meta">{zoomPercent}%</Text>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    {resetZoomLabel}
                  </TooltipContent>
                </Tooltip>
              )}
              <PreviewToolbarIconButton
                disabled={!canZoomIn}
                label={t("imagePreview.zoomIn")}
                onClick={() => updateZoom(zoom + PREVIEW_ZOOM_STEP)}
              >
                <Plus className={TITLEBAR_ICON_GLYPH_CLASS} />
              </PreviewToolbarIconButton>
              <PreviewToolbarIconButton
                label={t("imagePreview.rotate")}
                onClick={() => setRotation((current) => (current + 90) % 360)}
              >
                <RotateCw className={TITLEBAR_ICON_GLYPH_CLASS} />
              </PreviewToolbarIconButton>
              <PreviewToolbarIconButton
                disabled={!dataUrl}
                label={t("imagePreview.copyImage")}
                onClick={() => void handleCopy()}
              >
                <Copy className={TITLEBAR_ICON_GLYPH_CLASS} />
              </PreviewToolbarIconButton>
              <PreviewToolbarIconButton
                disabled={!dataUrl}
                label={t("imagePreview.downloadImage")}
                onClick={handleDownload}
              >
                <Download className={TITLEBAR_ICON_GLYPH_CLASS} />
              </PreviewToolbarIconButton>
              <PreviewToolbarIconButton
                label={t("imagePreview.closePreview")}
                onClick={onClose}
              >
                <X className={TITLEBAR_ICON_GLYPH_CLASS} />
              </PreviewToolbarIconButton>
            </div>
          </div>
        </TooltipProvider>
        <div
          className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
          onWheel={handleWheel}
        >
          {dataUrl ? (
            <img
              alt={attachment.name}
              className="max-h-full max-w-full origin-center object-contain transition-transform duration-100"
              src={dataUrl}
              style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
            />
          ) : (
            <Image className="size-8 text-chat-fg-muted" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ImageAttachmentChips({
  attachments,
  onPreview,
  onRemoveAttachment,
  tone,
}: {
  attachments: MessageAttachment[];
  onPreview?(attachment: ImageAttachment): void;
  onRemoveAttachment?(index: number): void;
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
          tone={tone}
        />
      ))}
    </div>
  );
}
