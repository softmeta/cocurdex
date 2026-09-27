import type { ImageAttachment } from "@cocurdex/shared";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Image,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  X,
} from "lucide-react";
import type {
  KeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useRef, useState } from "react";
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
import { cn, useMountEffect } from "@/lib";
import {
  useImageDataUrl,
  useTemporaryImageCopyStatus,
} from "./image-attachment-hooks";
import {
  imagePreviewNeighbor,
  resolveImagePreviewGallery,
} from "./image-preview-gallery";
import {
  clampImagePreviewPan,
  type ImagePreviewPanOffset,
  imagePreviewContentSize,
} from "./image-preview-pan";

const MIN_PREVIEW_ZOOM = 0.5;
const MAX_PREVIEW_ZOOM = 3;
const PREVIEW_ZOOM_STEP = 0.25;

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
  const [pan, setPan] = useState<ImagePreviewPanOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef({ rotation: 0, zoom: 1 });
  const dragRef = useRef<{
    originX: number;
    originY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [copyStatus, showCopyStatus] = useTemporaryImageCopyStatus(1800);
  const zoomPercent = Math.round(zoom * 100);
  const canZoomOut = zoom > MIN_PREVIEW_ZOOM;
  const canZoomIn = zoom < MAX_PREVIEW_ZOOM;
  const isAtDefaultZoom = Math.abs(zoom - 1) < 0.005;
  const isAtDefaultView =
    isAtDefaultZoom && rotation === 0 && pan.x === 0 && pan.y === 0;
  const resetZoomLabel = t("imagePreview.resetZoom");
  const { canNavigate, index, next, previous, total } =
    resolveImagePreviewGallery(attachment, gallery);
  const showNav = canNavigate && Boolean(onSelect);

  const clampPan = (
    offset: ImagePreviewPanOffset,
    zoomLevel = viewRef.current.zoom,
  ) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image) {
      return { x: 0, y: 0 };
    }
    const content = imagePreviewContentSize(
      { height: image.offsetHeight, width: image.offsetWidth },
      zoomLevel,
      viewRef.current.rotation,
    );
    return clampImagePreviewPan(
      offset,
      { height: viewport.clientHeight, width: viewport.clientWidth },
      content,
    );
  };

  const updateZoom = (nextZoom: number) => {
    const clamped = Math.min(
      MAX_PREVIEW_ZOOM,
      Math.max(MIN_PREVIEW_ZOOM, nextZoom),
    );
    viewRef.current.zoom = clamped;
    setZoom(clamped);
    setPan((current) => clampPan(current, clamped));
  };

  const resetView = () => {
    viewRef.current = { rotation: 0, zoom: 1 };
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  const handleRotate = () => {
    const next = (viewRef.current.rotation + 90) % 360;
    viewRef.current.rotation = next;
    setRotation(next);
    setPan({ x: 0, y: 0 });
  };

  const showAttachment = (nextAttachment: ImageAttachment) => {
    if (!onSelect) {
      return;
    }
    resetView();
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

  const handleViewportWheel = (event: globalThis.WheelEvent) => {
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      const direction = event.deltaY > 0 ? -1 : 1;
      updateZoom(viewRef.current.zoom + direction * PREVIEW_ZOOM_STEP);
      return;
    }

    setPan((current) =>
      clampPan({
        x: current.x - event.deltaX,
        y: current.y - event.deltaY,
      }),
    );
  };

  useMountEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.addEventListener("wheel", handleViewportWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleViewportWheel);
  });

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || !imageRef.current) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      return;
    }

    dragRef.current = {
      originX: pan.x,
      originY: pan.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setPan(
      clampPan({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }),
    );
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);
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
        <TooltipProvider>
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
                onClick={handleRotate}
              >
                <RotateCw className={TITLEBAR_ICON_GLYPH_CLASS} />
              </PreviewToolbarIconButton>
              <PreviewToolbarIconButton
                disabled={isAtDefaultView}
                label={t("imagePreview.resetView")}
                onClick={resetView}
              >
                <RotateCcw className={TITLEBAR_ICON_GLYPH_CLASS} />
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
          className={cn(
            "relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden p-4",
            dataUrl && "cursor-grab touch-none",
            isDragging && "cursor-grabbing",
          )}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          ref={viewportRef}
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
              className={cn(
                "max-h-full max-w-full origin-center object-contain",
                isDragging
                  ? "transition-none"
                  : "transition-transform duration-100",
              )}
              draggable={false}
              ref={imageRef}
              src={dataUrl}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
              }}
            />
          ) : (
            <Image className="size-8 text-chat-fg-muted" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
