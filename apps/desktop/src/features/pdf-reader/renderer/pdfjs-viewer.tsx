import * as pdfjs from "pdfjs-dist";
import {
  EventBus,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { type PdfRangeReader, type PdfSource, useMountEffect } from "@/lib";
import "pdfjs-dist/web/pdf_viewer.css";
import "./pdf-viewer-overrides.css";
import type { PdfHighlight } from "../pdf-annotations";
import {
  paintPdfHighlights,
  paintPdfPageHighlights,
} from "../pdf-highlight-layer";
import { buildPdfOutline, type PdfOutlineNode } from "../pdf-outline";
import {
  PDF_DOCUMENT_START,
  type PdfReadingPosition,
  resolveRestoredPosition,
} from "../pdf-reading-position";
import { MAX_SCALE, MIN_SCALE, ZOOM_STEP } from "../pdf-scale";
import {
  PDF_THUMBNAIL_MAX_EDGE,
  renderPdfPageThumbnail,
} from "./pdf-page-thumbnail";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const PERSIST_POSITION_DELAY_MS = 400;

const DOCUMENT_OPTIONS = {
  cMapUrl: "/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/standard_fonts/",
  disableAutoFetch: true,
  disableStream: true,
} as const;

function rangeTransport(reader: PdfRangeReader) {
  const transport = new pdfjs.PDFDataRangeTransport(
    reader.length,
    reader.initialData,
  );
  transport.requestDataRange = (begin, end) => {
    reader.read(begin, end).then(
      (chunk) => transport.onDataRange(begin, chunk),
      () => transport.abort(),
    );
  };
  return transport;
}

function documentSource(source: PdfSource) {
  if (source.kind === "url") {
    return { url: source.url, httpHeaders: source.httpHeaders };
  }
  return { range: rangeTransport(source.reader) };
}

export interface PdfFindMatches {
  current: number;
  total: number;
}

export interface PdfJsViewerHandle {
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  fitWidth(): void;
  fitPage(): void;
  goToPage(pageNumber: number): void;
  find(query: string): void;
  findNext(): void;
  findPrevious(): void;
  clearFind(): void;
  renderThumbnail(
    pageNumber: number,
    maxEdgePx?: number,
  ): Promise<string | null>;
}

interface PdfJsViewerProps {
  source: PdfSource;
  initialPosition?: PdfReadingPosition;
  highlights?: readonly PdfHighlight[];
  scrollContainerRef?: React.Ref<HTMLDivElement>;
  onReady?(numPages: number): void;
  onError?(): void;
  onOutlineLoaded?(outline: PdfOutlineNode[]): void;
  onPageChange?(pageNumber: number): void;
  onPositionChange?(position: PdfReadingPosition): void;
  onScaleChange?(scale: number): void;
  onFindMatchesChange?(matches: PdfFindMatches): void;
}

function dispatchFindAgain(
  eventBus: EventBus | null,
  query: string,
  findPrevious: boolean,
) {
  if (!eventBus || !query) {
    return;
  }
  eventBus.dispatch("find", {
    source: null,
    type: "again",
    query,
    caseSensitive: false,
    entireWord: false,
    highlightAll: true,
    findPrevious,
    matchDiacritics: false,
  });
}

function scrollToPosition(viewer: PDFViewer, position: PdfReadingPosition) {
  viewer.scrollPageIntoView({
    pageNumber: position.page,
    destArray: [
      null,
      { name: "XYZ" },
      position.left,
      position.top,
      null,
    ] as unknown[],
  });
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

export const PdfJsViewer = forwardRef<PdfJsViewerHandle, PdfJsViewerProps>(
  function PdfJsViewer(props, handleRef) {
    return (
      <PdfJsViewerContent
        {...props}
        key={props.source.kind === "url" ? props.source.url : props.source.path}
        ref={handleRef}
      />
    );
  },
);

function usePaintedPdfHighlights(
  viewerElementRef: React.RefObject<HTMLDivElement | null>,
  highlights: readonly PdfHighlight[],
) {
  useLayoutEffect(() => {
    paintPdfHighlights(viewerElementRef.current, highlights);
  }, [highlights, viewerElementRef]);
}

const PdfJsViewerContent = forwardRef<PdfJsViewerHandle, PdfJsViewerProps>(
  function PdfJsViewer(
    {
      source,
      initialPosition,
      highlights = [],
      scrollContainerRef,
      onReady,
      onError,
      onOutlineLoaded,
      onPageChange,
      onPositionChange,
      onScaleChange,
      onFindMatchesChange,
    },
    handleRef,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewerElementRef = useRef<HTMLDivElement | null>(null);
    const viewerRef = useRef<PDFViewer | null>(null);
    const eventBusRef = useRef<EventBus | null>(null);
    const queryRef = useRef("");
    const initialPositionRef = useRef(initialPosition);
    const onPositionChangeRef = useRef(onPositionChange);
    onPositionChangeRef.current = onPositionChange;
    const highlightsRef = useRef(highlights);
    highlightsRef.current = highlights;
    const pdfDocumentRef = useRef<pdfjs.PDFDocumentProxy | null>(null);

    const setOverflowForPreset = useCallback((isPreset: boolean) => {
      const el = containerRef.current;
      if (el) {
        el.style.overflowX = isPreset ? "hidden" : "auto";
      }
    }, []);

    useImperativeHandle(handleRef, () => ({
      zoomIn() {
        const viewer = viewerRef.current;
        if (viewer) {
          viewer.currentScale = Math.min(
            MAX_SCALE,
            viewer.currentScale * ZOOM_STEP,
          );
          setOverflowForPreset(false);
        }
      },
      zoomOut() {
        const viewer = viewerRef.current;
        if (viewer) {
          viewer.currentScale = Math.max(
            MIN_SCALE,
            viewer.currentScale / ZOOM_STEP,
          );
          setOverflowForPreset(false);
        }
      },
      resetZoom() {
        const viewer = viewerRef.current;
        if (viewer) {
          viewer.currentScale = 1;
          setOverflowForPreset(false);
        }
      },
      fitWidth() {
        const viewer = viewerRef.current;
        if (viewer) {
          viewer.currentScaleValue = "page-width";
          setOverflowForPreset(true);
        }
      },
      fitPage() {
        const viewer = viewerRef.current;
        if (viewer) {
          viewer.currentScaleValue = "page-fit";
          setOverflowForPreset(true);
        }
      },
      goToPage(pageNumber: number) {
        const viewer = viewerRef.current;
        if (viewer) {
          viewer.scrollPageIntoView({ pageNumber });
        }
      },
      find(query: string) {
        queryRef.current = query;
        eventBusRef.current?.dispatch("find", {
          source: null,
          type: "",
          query,
          caseSensitive: false,
          entireWord: false,
          highlightAll: true,
          findPrevious: false,
          matchDiacritics: false,
        });
      },
      findNext() {
        dispatchFindAgain(eventBusRef.current, queryRef.current, false);
      },
      findPrevious() {
        dispatchFindAgain(eventBusRef.current, queryRef.current, true);
      },
      clearFind() {
        queryRef.current = "";
        eventBusRef.current?.dispatch("find", {
          source: null,
          type: "",
          query: "",
          caseSensitive: false,
          entireWord: false,
          highlightAll: false,
          findPrevious: false,
          matchDiacritics: false,
        });
      },
      async renderThumbnail(pageNumber: number, maxEdgePx?: number) {
        const pdf = pdfDocumentRef.current;
        if (!pdf) {
          return null;
        }
        try {
          return await renderPdfPageThumbnail(
            pdf,
            pageNumber,
            maxEdgePx ?? PDF_THUMBNAIL_MAX_EDGE,
          );
        } catch {
          return null;
        }
      },
    }));

    useMountEffect(() => {
      const container = containerRef.current;
      const viewerElement = viewerElementRef.current;
      if (!container || !viewerElement) {
        return;
      }

      let cancelled = false;
      let isCollapsed = false;
      const eventBus = new EventBus();
      const linkService = new PDFLinkService({ eventBus });
      const findController = new PDFFindController({ eventBus, linkService });
      const pdfViewer = new PDFViewer({
        container,
        viewer: viewerElement,
        eventBus,
        linkService,
        findController,
      });
      linkService.setViewer(pdfViewer);
      viewerRef.current = pdfViewer;
      eventBusRef.current = eventBus;

      const applyInitialLayout = (restored: PdfReadingPosition) => {
        pdfViewer.currentScaleValue = "page-width";
        setOverflowForPreset(true);
        lastPosition = restored;
        if (restored.page > 1 || restored.top !== 0 || restored.left !== 0) {
          scrollToPosition(pdfViewer, restored);
        }
      };
      let pendingInitialPosition: PdfReadingPosition | null = null;
      eventBus.on("pagesinit", () => {
        const restored = resolveRestoredPosition(
          initialPositionRef.current,
          pdfViewer.pagesCount,
        );
        if (container.clientHeight === 0) {
          isCollapsed = true;
          pendingInitialPosition = restored;
          return;
        }
        applyInitialLayout(restored);
      });
      const handlePageChanging = (event: { pageNumber: number }) =>
        onPageChange?.(event.pageNumber);
      let lastPosition: PdfReadingPosition = PDF_DOCUMENT_START;
      let persistTimer: ReturnType<typeof setTimeout> | undefined;
      const handleUpdateViewArea = (event: {
        location?: { pageNumber: number; top?: number; left?: number };
      }) => {
        const location = event.location;
        if (!location || isCollapsed) {
          return;
        }
        lastPosition = {
          page: location.pageNumber,
          top: location.top ?? 0,
          left: location.left ?? 0,
        };
        clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
          onPositionChangeRef.current?.(lastPosition);
        }, PERSIST_POSITION_DELAY_MS);
      };
      const handleScaleChanging = (event: { scale: number }) =>
        onScaleChange?.(event.scale);
      const handleFindUpdate = (event: {
        matchesCount?: { current: number; total: number };
      }) =>
        onFindMatchesChange?.({
          current: event.matchesCount?.current ?? 0,
          total: event.matchesCount?.total ?? 0,
        });
      eventBus.on("pagechanging", handlePageChanging);
      eventBus.on("updateviewarea", handleUpdateViewArea);
      eventBus.on("scalechanging", handleScaleChanging);
      eventBus.on("updatefindmatchescount", handleFindUpdate);
      eventBus.on("updatefindcontrolstate", handleFindUpdate);

      const handlePageRendered = (event: { pageNumber: number }) => {
        paintPdfPageHighlights(
          viewerElement,
          event.pageNumber,
          highlightsRef.current,
        );
      };
      eventBus.on("pagerendered", handlePageRendered);

      const loadingTask = pdfjs.getDocument({
        ...documentSource(source),
        ...DOCUMENT_OPTIONS,
      });

      loadingTask.promise
        .then((pdfDocument) => {
          if (cancelled) {
            return;
          }
          pdfDocumentRef.current = pdfDocument;
          pdfViewer.setDocument(pdfDocument);
          linkService.setDocument(pdfDocument, null);
          findController.setDocument(pdfDocument);
          onReady?.(pdfDocument.numPages);

          if (onOutlineLoaded) {
            buildPdfOutline(pdfDocument)
              .then((outline) => {
                if (!cancelled) {
                  onOutlineLoaded(outline);
                }
              })
              .catch(() => onOutlineLoaded([]));
          }
        })
        .catch(() => {
          if (!cancelled) {
            onError?.();
          }
        });

      const PINCH_SENSITIVITY = 0.01;
      const handleWheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
        event.preventDefault();
        const cur = pdfViewer.currentScale;
        const newScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, cur * (1 - event.deltaY * PINCH_SENSITIVITY)),
        );
        if (newScale === cur) {
          return;
        }
        pdfViewer.currentScale = newScale;
        setOverflowForPreset(false);
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const factor = newScale / cur;
        container.scrollLeft = (container.scrollLeft + x) * factor - x;
        container.scrollTop = (container.scrollTop + y) * factor - y;
      };
      container.addEventListener("wheel", handleWheel, { passive: false });

      const resizeObserver = new ResizeObserver(() => {
        if (container.clientHeight === 0) {
          isCollapsed = true;
          return;
        }
        if (pendingInitialPosition) {
          const restored = pendingInitialPosition;
          pendingInitialPosition = null;
          applyInitialLayout(restored);
          isCollapsed = false;
          return;
        }
        const sv = pdfViewer.currentScaleValue;
        if (sv === "page-width" || sv === "page-fit") {
          pdfViewer.currentScaleValue = sv;
        }
        if (isCollapsed) {
          isCollapsed = false;
          scrollToPosition(pdfViewer, lastPosition);
        }
      });
      resizeObserver.observe(container);

      return () => {
        cancelled = true;
        container.removeEventListener("wheel", handleWheel);
        resizeObserver.disconnect();
        clearTimeout(persistTimer);
        eventBus.off("pagechanging", handlePageChanging);
        eventBus.off("updateviewarea", handleUpdateViewArea);
        eventBus.off("scalechanging", handleScaleChanging);
        eventBus.off("updatefindmatchescount", handleFindUpdate);
        eventBus.off("updatefindcontrolstate", handleFindUpdate);
        eventBus.off("pagerendered", handlePageRendered);
        viewerRef.current = null;
        eventBusRef.current = null;
        pdfDocumentRef.current = null;
        loadingTask.destroy();
        pdfViewer.cleanup();
      };
    });

    usePaintedPdfHighlights(viewerElementRef, highlights);

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          setRef(scrollContainerRef, node);
        }}
        className="pdfViewer-container absolute inset-0 overflow-y-scroll overflow-x-hidden"
      >
        <div ref={viewerElementRef} className="pdfViewer" />
      </div>
    );
  },
);
