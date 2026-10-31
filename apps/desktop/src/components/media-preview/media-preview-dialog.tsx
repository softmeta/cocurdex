import { Minus, Plus, RotateCcw, RotateCw, X } from "lucide-react";
import type {
  KeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppWindowOverlayHeader } from "@/components/app";
import { Dialog, DialogContent, DialogTitle, Text } from "@/components/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib";
import {
  clampPreviewPan,
  type PreviewPanOffset,
  type PreviewScaleLimits,
  type PreviewSize,
  previewContentSize,
  previewFrameSize,
} from "./preview-geometry";
import { PreviewToolbarButton } from "./preview-toolbar-button";
import { useContentBoxSize, useNonPassiveWheel } from "./use-preview-viewport";

const MIN_PREVIEW_ZOOM = 0.5;
const MAX_PREVIEW_ZOOM = 4;
const PREVIEW_ZOOM_STEP = 0.25;
const CENTERED_PAN: PreviewPanOffset = { x: 0, y: 0 };
const TOP_ALIGNED_PAN: PreviewPanOffset = {
  x: 0,
  y: Number.POSITIVE_INFINITY,
};

interface PreviewView {
  key: string | undefined;
  pan: PreviewPanOffset;
  rotation: number;
  zoom: number;
}

function initialView(key: string | undefined): PreviewView {
  return { key, pan: TOP_ALIGNED_PAN, rotation: 0, zoom: 1 };
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, zoom));
}

export function MediaPreviewDialog({
  actions,
  children,
  contentSize,
  onClose,
  onKeyDown,
  overlay,
  rotatable = false,
  scaleLimits,
  status,
  subtitle,
  title,
  viewKey,
}: {
  actions?: ReactNode;
  children: ReactNode;
  contentSize: PreviewSize | null;
  onClose(): void;
  onKeyDown?(event: KeyboardEvent<HTMLDivElement>): void;
  overlay?: ReactNode;
  rotatable?: boolean;
  scaleLimits: PreviewScaleLimits;
  status?: ReactNode;
  subtitle?: string;
  title: string;
  viewKey?: string;
}) {
  const { t } = useTranslation("common");
  const [view, setView] = useState(() => initialView(viewKey));
  if (view.key !== viewKey) {
    setView(initialView(viewKey));
  }
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const viewportSize = useContentBoxSize(viewport);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    originX: number;
    originY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const frame =
    contentSize && viewportSize
      ? previewFrameSize(contentSize, viewportSize, view.rotation, scaleLimits)
      : null;

  const clampPan = (
    offset: PreviewPanOffset,
    zoom: number,
    rotation: number,
  ) => {
    if (!frame || !viewportSize) {
      return CENTERED_PAN;
    }
    const content = previewContentSize(frame, zoom, rotation);
    return clampPreviewPan(offset, viewportSize, content);
  };

  const pan = clampPan(view.pan, view.zoom, view.rotation);
  const homePan = clampPan(TOP_ALIGNED_PAN, 1, view.rotation);
  const isAtDefaultView =
    view.zoom === 1 &&
    view.rotation === 0 &&
    pan.x === homePan.x &&
    pan.y === homePan.y;
  const zoomPercent = Math.round(view.zoom * 100);

  const panBy = (deltaX: number, deltaY: number) => {
    setView((current) => {
      const from = clampPan(current.pan, current.zoom, current.rotation);
      const next = { x: from.x + deltaX, y: from.y + deltaY };
      return {
        ...current,
        pan: clampPan(next, current.zoom, current.rotation),
      };
    });
  };

  const zoomBy = (delta: number) => {
    setView((current) => ({
      ...current,
      zoom: clampZoom(current.zoom + delta),
    }));
  };

  const resetZoom = () => {
    setView((current) => ({ ...current, zoom: 1 }));
  };

  const rotate = () => {
    setView((current) => ({
      ...current,
      pan: TOP_ALIGNED_PAN,
      rotation: (current.rotation + 90) % 360,
    }));
  };

  const resetView = () => {
    setView(initialView(viewKey));
  };

  useNonPassiveWheel(viewport, (event) => {
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      zoomBy(event.deltaY > 0 ? -PREVIEW_ZOOM_STEP : PREVIEW_ZOOM_STEP);
      return;
    }
    panBy(-event.deltaX, -event.deltaY);
  });

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || !frame) {
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

    const next = {
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    };
    setView((current) => ({
      ...current,
      pan: clampPan(next, current.zoom, current.rotation),
    }));
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);
  };

  const resetZoomLabel = t("preview.resetZoom");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden bg-chat-surface p-0 text-chat-fg"
        onKeyDown={onKeyDown}
        showCloseButton={false}
        size="window"
      >
        <DialogTitle className="sr-only">
          {subtitle ? `${title} ${subtitle}` : title}
        </DialogTitle>
        <TooltipProvider>
          <AppWindowOverlayHeader className="justify-between border-chat-border/40">
            <div className="flex min-w-0 items-center gap-2">
              <Text className="block truncate text-chat-fg" size="body">
                {title}
              </Text>
              {subtitle ? (
                <Text
                  className="shrink-0 text-chat-fg-muted tabular-nums"
                  size="meta"
                >
                  {subtitle}
                </Text>
              ) : null}
            </div>
            <div className="app-no-drag flex shrink-0 items-center gap-1">
              {status}
              <PreviewToolbarButton
                disabled={view.zoom <= MIN_PREVIEW_ZOOM}
                label={t("preview.zoomOut")}
                onClick={() => zoomBy(-PREVIEW_ZOOM_STEP)}
                tooltipSide="bottom"
              >
                <Minus className="size-3.5" />
              </PreviewToolbarButton>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      aria-label={resetZoomLabel}
                      className="flex h-6 min-w-10 cursor-pointer items-center justify-center rounded-control px-1.5 text-chat-fg-muted tabular-nums hover:bg-muted hover:text-chat-fg disabled:pointer-events-none dark:hover:bg-muted/50"
                      disabled={view.zoom === 1}
                      onClick={resetZoom}
                      type="button"
                    >
                      <Text size="meta">{zoomPercent}%</Text>
                    </button>
                  }
                />
                <TooltipContent side="bottom" sideOffset={6}>
                  {resetZoomLabel}
                </TooltipContent>
              </Tooltip>
              <PreviewToolbarButton
                disabled={view.zoom >= MAX_PREVIEW_ZOOM}
                label={t("preview.zoomIn")}
                onClick={() => zoomBy(PREVIEW_ZOOM_STEP)}
                tooltipSide="bottom"
              >
                <Plus className="size-3.5" />
              </PreviewToolbarButton>
              {rotatable ? (
                <PreviewToolbarButton
                  label={t("preview.rotate")}
                  onClick={rotate}
                  tooltipSide="bottom"
                >
                  <RotateCw className="size-3.5" />
                </PreviewToolbarButton>
              ) : null}
              <PreviewToolbarButton
                disabled={isAtDefaultView}
                label={t("preview.resetView")}
                onClick={resetView}
                tooltipSide="bottom"
              >
                <RotateCcw className="size-3.5" />
              </PreviewToolbarButton>
              {actions}
              <PreviewToolbarButton
                label={t("preview.closePreview")}
                onClick={onClose}
                tooltipSide="bottom"
              >
                <X className="size-3.5" />
              </PreviewToolbarButton>
            </div>
          </AppWindowOverlayHeader>
        </TooltipProvider>
        <div
          className={cn(
            "relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden p-6",
            frame && "cursor-grab touch-none",
            isDragging && "cursor-grabbing",
          )}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          ref={setViewport}
        >
          {overlay}
          <div
            className={cn(
              "shrink-0 origin-center",
              !frame && "invisible absolute",
              isDragging
                ? "transition-none"
                : "transition-transform duration-100",
            )}
            style={
              frame
                ? {
                    height: frame.height,
                    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${view.rotation}deg) scale(${view.zoom})`,
                    width: frame.width,
                  }
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
