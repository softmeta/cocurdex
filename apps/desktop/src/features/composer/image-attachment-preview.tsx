import type { ImageAttachment } from "@cocurdex/shared";
import { ChevronLeft, ChevronRight, Copy, Download, Image } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MediaPreviewDialog,
  PreviewToolbarButton,
} from "@/components/media-preview";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import {
  useImageDataUrl,
  useTemporaryImageCopyStatus,
} from "./image-attachment-hooks";
import {
  imagePreviewNeighbor,
  resolveImagePreviewGallery,
} from "./image-preview-gallery";

const IMAGE_SCALE_LIMITS = { max: 1, min: 0.75 };

interface LoadedImageSize {
  height: number;
  src: string;
  width: number;
}

function attachmentSize(attachment: ImageAttachment) {
  if (attachment.width > 0 && attachment.height > 0) {
    return { height: attachment.height, width: attachment.width };
  }
  return null;
}

function PreviewNavButton({
  disabled,
  edge,
  label,
  onClick,
  children,
}: {
  disabled: boolean;
  edge: "end" | "start";
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-10 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-chat-border bg-chat-surface/90 text-chat-fg shadow-chat-soft hover:bg-chat-surface disabled:pointer-events-none disabled:cursor-default disabled:opacity-40",
        edge === "start" && "start-3",
        edge === "end" && "end-3",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function ImageAttachmentPreview({
  attachment,
  gallery = [],
  onClose,
  onSelect,
}: {
  attachment: ImageAttachment;
  gallery?: readonly ImageAttachment[];
  onClose(): void;
  onSelect?(next: ImageAttachment): void;
}) {
  const { t } = useTranslation("agent");
  const dataUrl = useImageDataUrl(attachment);
  const [loadedSize, setLoadedSize] = useState<LoadedImageSize | null>(null);
  const [copyStatus, showCopyStatus] = useTemporaryImageCopyStatus(1800);
  const { canNavigate, index, next, previous, total } =
    resolveImagePreviewGallery(attachment, gallery);
  const showNav = canNavigate && Boolean(onSelect);
  const contentSize =
    attachmentSize(attachment) ??
    (loadedSize && loadedSize.src === dataUrl ? loadedSize : null);

  const showAttachment = (nextAttachment: ImageAttachment) => {
    onSelect?.(nextAttachment);
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

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!showNav) {
      return;
    }

    const neighbor = imagePreviewNeighbor(
      event.key,
      document.documentElement.dir === "rtl",
    );
    if (!neighbor) {
      return;
    }

    const target = neighbor === "previous" ? previous : next;
    if (!target) {
      return;
    }

    event.preventDefault();
    showAttachment(target);
  };

  return (
    <MediaPreviewDialog
      actions={
        <>
          <PreviewToolbarButton
            disabled={!dataUrl}
            label={t("imagePreview.copyImage")}
            onClick={() => void handleCopy()}
            tooltipSide="bottom"
          >
            <Copy className="size-3.5" />
          </PreviewToolbarButton>
          <PreviewToolbarButton
            disabled={!dataUrl}
            label={t("imagePreview.downloadImage")}
            onClick={handleDownload}
            tooltipSide="bottom"
          >
            <Download className="size-3.5" />
          </PreviewToolbarButton>
        </>
      }
      contentSize={dataUrl ? contentSize : null}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      overlay={
        <>
          {showNav ? (
            <>
              <PreviewNavButton
                disabled={!previous}
                edge="start"
                label={t("imagePreview.previousImage")}
                onClick={() => {
                  if (previous) showAttachment(previous);
                }}
              >
                <ChevronLeft className="size-4 rtl:rotate-180" />
              </PreviewNavButton>
              <PreviewNavButton
                disabled={!next}
                edge="end"
                label={t("imagePreview.nextImage")}
                onClick={() => {
                  if (next) showAttachment(next);
                }}
              >
                <ChevronRight className="size-4 rtl:rotate-180" />
              </PreviewNavButton>
            </>
          ) : null}
          {dataUrl ? null : <Image className="size-8 text-chat-fg-muted" />}
        </>
      }
      rotatable
      scaleLimits={IMAGE_SCALE_LIMITS}
      status={
        copyStatus ? (
          <output className="me-1">
            <Text className="text-chat-fg-muted" size="meta">
              {copyStatus === "copied"
                ? t("imagePreview.copied")
                : t("imagePreview.copyFailed")}
            </Text>
          </output>
        ) : null
      }
      subtitle={
        showNav
          ? t("imagePreview.imagePosition", {
              current: String(index + 1),
              total: String(total),
            })
          : undefined
      }
      title={attachment.name}
      viewKey={attachment.id}
    >
      {dataUrl ? (
        <img
          alt={attachment.name}
          className="block size-full"
          draggable={false}
          onLoad={(event) =>
            setLoadedSize({
              height: event.currentTarget.naturalHeight,
              src: dataUrl,
              width: event.currentTarget.naturalWidth,
            })
          }
          src={dataUrl}
        />
      ) : null}
    </MediaPreviewDialog>
  );
}
