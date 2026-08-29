import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { useMountEffect } from "@/lib";
import { cn } from "@/lib/utils";
import {
  estimatePdfThumbnailRowHeight,
  pdfThumbnailContentWidth,
  pdfThumbnailImageHeight,
  pdfThumbnailRenderEdge,
} from "./pdf-thumbnail-layout";

const OVERSCAN = 3;

interface PdfThumbnailsPanelProps {
  totalPages: number;
  currentPage: number;
  // Current left-rail width in CSS px — thumbnails fill this minus padding.
  panelWidth: number;
  onSelectPage(pageNumber: number): void;
  // Renders a JPEG data URL for the given 1-based page at maxEdge CSS px.
  // Cached by the panel keyed on page + render edge bucket.
  renderThumbnail(
    pageNumber: number,
    maxEdgePx: number,
  ): Promise<string | null>;
}

export function PdfThumbnailsPanel({
  totalPages,
  currentPage,
  panelWidth,
  onSelectPage,
  renderThumbnail,
}: PdfThumbnailsPanelProps) {
  const { t } = useTranslation("editor");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef(new Map<string, string>());
  const anchorIndexRef = useRef(0);
  const prevRowHeightRef = useRef<number | null>(null);
  const prevCurrentPageRef = useRef(currentPage);
  const rowHeightRef = useRef(0);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const contentWidth = pdfThumbnailContentWidth(panelWidth);
  const imageHeight = pdfThumbnailImageHeight(contentWidth);
  const rowHeight = estimatePdfThumbnailRowHeight(panelWidth);
  const renderEdge = pdfThumbnailRenderEdge(
    panelWidth,
    typeof window !== "undefined" ? window.devicePixelRatio : 1,
  );
  rowHeightRef.current = rowHeight;

  const loadThumbnail = useCallback(
    async (pageNumber: number): Promise<string | null> => {
      const cacheKey = `${pageNumber}@${renderEdge}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
      const url = await renderThumbnail(pageNumber, renderEdge);
      if (url) {
        cacheRef.current.set(cacheKey, url);
      }
      return url;
    },
    [renderThumbnail, renderEdge],
  );

  // Track viewport height so the visible window stays correct after rail resize.
  useMountEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  });

  const captureAnchorFromScrollTop = useCallback(
    (nextScrollTop: number) => {
      const est = rowHeightRef.current;
      if (est <= 0) {
        return;
      }
      const maxIndex = Math.max(0, totalPages - 1);
      anchorIndexRef.current = Math.min(
        maxIndex,
        Math.max(0, Math.round(nextScrollTop / est)),
      );
    },
    [totalPages],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setScrollTop(el.scrollTop);
    captureAnchorFromScrollTop(el.scrollTop);
  }, [captureAnchorFromScrollTop]);

  // When the rail width changes, row heights change. Restore the previously
  // visible top page via scrollTop. Legitimate layout effect: external scroll.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (prevRowHeightRef.current === null) {
      prevRowHeightRef.current = rowHeight;
      return;
    }
    if (prevRowHeightRef.current === rowHeight) {
      return;
    }

    if (el && prevRowHeightRef.current > 0) {
      const maxIndex = Math.max(0, totalPages - 1);
      anchorIndexRef.current = Math.min(
        maxIndex,
        Math.max(0, Math.round(el.scrollTop / prevRowHeightRef.current)),
      );
    }

    prevRowHeightRef.current = rowHeight;
    if (!el) {
      return;
    }
    const nextTop = anchorIndexRef.current * rowHeight;
    el.scrollTop = nextTop;
    setScrollTop(nextTop);
  }, [rowHeight, totalPages]);

  // Only auto-follow the reading page when it actually changes — never on resize.
  useLayoutEffect(() => {
    if (prevCurrentPageRef.current === currentPage) {
      return;
    }
    prevCurrentPageRef.current = currentPage;
    const index = Math.max(0, currentPage - 1);
    anchorIndexRef.current = index;
    const el = scrollRef.current;
    if (el) {
      const nextTop = index * rowHeightRef.current;
      el.scrollTop = nextTop;
      setScrollTop(nextTop);
    }
  }, [currentPage]);

  if (totalPages < 1) {
    return null;
  }

  // Manual windowing with the *live* row height. TanStack Virtual was caching
  // item sizes/ranges from the previous width, leaving blank holes while page
  // labels still existed in the full scroll height.
  const totalHeight = totalPages * rowHeight;
  const safeViewport = Math.max(viewportHeight, 1);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const endIndex = Math.min(
    totalPages,
    Math.ceil((scrollTop + safeViewport) / rowHeight) + OVERSCAN,
  );

  const items: number[] = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    items.push(index);
  }

  return (
    <nav
      ref={scrollRef}
      className="size-full overflow-y-auto"
      aria-label={t("pdf.thumbnails")}
      onScroll={handleScroll}
    >
      <div className="relative w-full" style={{ height: totalHeight }}>
        {items.map((index) => {
          const pageNumber = index + 1;
          return (
            <div
              key={pageNumber}
              data-index={index}
              className="absolute start-0 top-0 w-full"
              style={{
                height: rowHeight,
                transform: `translateY(${index * rowHeight}px)`,
              }}
            >
              <ThumbnailRow
                pageNumber={pageNumber}
                isActive={pageNumber === currentPage}
                contentWidth={contentWidth}
                imageHeight={imageHeight}
                renderEdge={renderEdge}
                loadThumbnail={loadThumbnail}
                onSelectPage={onSelectPage}
              />
            </div>
          );
        })}
      </div>
    </nav>
  );
}

interface ThumbnailRowProps {
  pageNumber: number;
  isActive: boolean;
  contentWidth: number;
  imageHeight: number;
  renderEdge: number;
  loadThumbnail(pageNumber: number): Promise<string | null>;
  onSelectPage(pageNumber: number): void;
}

function ThumbnailRow({
  pageNumber,
  isActive,
  contentWidth,
  imageHeight,
  renderEdge,
  loadThumbnail,
  onSelectPage,
}: ThumbnailRowProps) {
  const { t } = useTranslation("editor");

  return (
    <div className="flex h-full flex-col items-center justify-start gap-1 px-3 py-2">
      <button
        type="button"
        onClick={() => onSelectPage(pageNumber)}
        aria-label={t("pdf.thumbnailPage", { page: String(pageNumber) })}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "overflow-hidden rounded-control border bg-white p-1 shadow-sm transition-colors",
          isActive
            ? "border-primary ring-2 ring-primary/30"
            : "border-editor-border hover:border-primary/50",
        )}
        style={{ width: contentWidth }}
      >
        <ThumbnailImage
          key={`${pageNumber}-${renderEdge}`}
          pageNumber={pageNumber}
          contentWidth={contentWidth}
          imageHeight={imageHeight}
          loadThumbnail={loadThumbnail}
        />
      </button>
      <Text
        size="meta"
        tone={isActive ? "default" : "muted"}
        className="tabular-nums"
      >
        {pageNumber}
      </Text>
    </div>
  );
}

interface ThumbnailImageProps {
  pageNumber: number;
  contentWidth: number;
  imageHeight: number;
  loadThumbnail(pageNumber: number): Promise<string | null>;
}

function ThumbnailImage({
  pageNumber,
  contentWidth,
  imageHeight,
  loadThumbnail,
}: ThumbnailImageProps) {
  const { t } = useTranslation("editor");
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useMountEffect(() => {
    let cancelled = false;
    loadThumbnail(pageNumber).then((url) => {
      if (cancelled) {
        return;
      }
      if (url) {
        setSrc(url);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  });

  return (
    <div
      className="mx-auto flex items-center justify-center bg-muted/30"
      style={{ width: contentWidth - 8, height: imageHeight }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <Text size="meta" tone="muted">
          {failed ? t("pdf.thumbnailError") : t("pdf.thumbnailLoading")}
        </Text>
      )}
    </div>
  );
}
