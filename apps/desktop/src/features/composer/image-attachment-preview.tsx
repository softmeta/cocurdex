import type { ImageAttachment } from "@cocurdex/shared";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Image,
  Minus,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import type { KeyboardEvent, ReactNode, WheelEvent } from "react";
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
import { cn } from "@/lib";
import {
  useImageDataUrl,
  useTemporaryImageCopyStatus,
} from "./image-attachment-hooks";
import {
  imagePreviewNeighbor,
  resolveImagePreviewGallery,
} from "./image-preview-gallery";

const MIN_PREVIEW_ZOOM = 0.5;
const MAX_PREVIEW_ZOOM = 3;
const PREVIEW_ZOOM_STEP = 0.25;
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
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copyStatus, showCopyStatus] = useTemporaryImageCopyStatus(1800);
  const zoomPercent = Math.round(zoom * 100);
  const canZoomOut = zoom > MIN_PREVIEW_ZOOM;
  const canZoomIn = zoom < MAX_PREVIEW_ZOOM;
  const isAtDefaultZoom = Math.abs(zoom - 1) < 0.005;
  const resetZoomLabel = t("imagePreview.resetZoom");
  const { canNavigate, index, next, previous, total } =
    resolveImagePreviewGallery(attachment, gallery);
  const showNav = canNavigate && Boolean(onSelect);

  const updateZoom = (nextZoom: number) => {
    setZoom(Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, nextZoom)));
  };

  const showAttachment = (nextAttachment: ImageAttachment) => {
    if (!onSelect) {
      return;
    }
    setZoom(1);
    setRotation(0);
    onSelect(nextAttachment);
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

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    updateZoom(zoom + direction * PREVIEW_ZOOM_STEP);
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

  const previousLabel = t("imagePreview.previousImage");
  const nextLabel = t("imagePreview.nextImage");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex h-[min(85dvh,40rem)] w-full flex-col gap-0 overflow-hidden rounded-panel border-chat-border bg-chat-surface p-0 text-chat-fg shadow-2xl"
        onKeyDown={handleKeyDown}
        showCloseButton={false}
        size="wide"
      >
        <DialogTitle className="sr-only">
          {showNav
            ? `${attachment.name} ${t("imagePreview.imagePosition", {
                current: String(index + 1),
                total: String(total),
              })}`
            : attachment.name}
        </DialogTitle>
        <TooltipProvider delay={PREVIEW_TOOLBAR_TOOLTIP_DELAY_MS}>
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-chat-border/40 border-b px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Text className="block truncate text-chat-fg" size="body">
                {attachment.name}
              </Text>
              {showNav ? (
                <Text
                  className="shrink-0 text-chat-fg-muted tabular-nums"
                  size="meta"
                >
                  {t("imagePreview.imagePosition", {
                    current: String(index + 1),
                    total: String(total),
                  })}
                </Text>
              ) : null}
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
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
          onWheel={handleWheel}
        >
          {showNav ? (
            <>
              <PreviewNavButton
                disabled={!previous}
                edge="start"
                label={previousLabel}
                onClick={() => {
                  if (previous) showAttachment(previous);
                }}
              >
                <ChevronLeft className="size-4 rtl:rotate-180" />
              </PreviewNavButton>
              <PreviewNavButton
                disabled={!next}
                edge="end"
                label={nextLabel}
                onClick={() => {
                  if (next) showAttachment(next);
                }}
              >
                <ChevronRight className="size-4 rtl:rotate-180" />
              </PreviewNavButton>
            </>
          ) : null}
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
