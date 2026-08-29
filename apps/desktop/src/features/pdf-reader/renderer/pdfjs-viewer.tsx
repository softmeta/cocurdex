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
import { useMountEffect } from "@/lib";
import "pdfjs-dist/web/pdf_viewer.css";
import "./pdf-viewer-overrides.css";
import type { PdfHighlight } from "../pdf-annotations";
import { paintPdfHighlights } from "../pdf-highlight-layer";
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

// === pdf.js viewer isolation boundary ===
// This is the ONLY module that imports `pdfjs-dist` / its viewer layer. The
// reader drives it through the small imperative handle and callbacks below, so
// pdf.js's virtualization, scrolling and destination navigation stay
// encapsulated here. We deliberately use pdf.js's own `PDFViewer` instead of a
// hand-rolled virtual list: it manages page virtualization and exact
// outline/page navigation using real page geometry, which a height-estimating
// virtualizer cannot match.

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// cMaps (CJK glyph maps) and standard fonts are copied into the renderer output
// at `/cmaps/` and `/standard_fonts/` (see electron.vite.config.ts). Without
// them, CJK PDFs render as empty boxes.
// Writing the reading position on every scroll frame would hammer storage;
// pdf.js's own viewer debounces its history writes the same way.
const PERSIST_POSITION_DELAY_MS = 400;

const DOCUMENT_OPTIONS = {
  cMapUrl: "/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/standard_fonts/",
} as const;

export interface PdfFindMatches {
  // 1-based index of the active match, or 0 when there are none.
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
  // Start a fresh in-document search and highlight all matches.
  find(query: string): void;
  // Move to the next / previous match of the current query.
  findNext(): void;
  findPrevious(): void;
  // Clear the search and remove highlights.
  clearFind(): void;
  // Render a JPEG data URL for the thumbnails rail. `maxEdgePx` is the longest
  // canvas edge (CSS px, already scaled for DPR by the caller). Returns null
  // when the document is not ready or the page is out of range.
  renderThumbnail(
    pageNumber: number,
    maxEdgePx?: number,
  ): Promise<string | null>;
}

interface PdfJsViewerProps {
  url: string;
  // Position to land on after the first layout. Defaults to the document start
  // when omitted or out of range; used to restore the last reading position.
  initialPosition?: PdfReadingPosition;
  // App-side text highlights painted into each page's DOM. Geometry is
  // page-normalized so zoom does not require recomputing quads.
  highlights?: readonly PdfHighlight[];
  // The scroll container is owned here but exposed so the selection bridge can
  // observe text-layer selections inside it.
  scrollContainerRef?: React.Ref<HTMLDivElement>;
  onReady?(numPages: number): void;
  onError?(): void;
  onOutlineLoaded?(outline: PdfOutlineNode[]): void;
  onPageChange?(pageNumber: number): void;
  // Fires (debounced) as the reading position settles, for persistence.
  onPositionChange?(position: PdfReadingPosition): void;
  onScaleChange?(scale: number): void;
  onFindMatchesChange?(matches: PdfFindMatches): void;
}

// Repeat the active query to step to the next/previous match. pdf.js uses the
// "again" type to advance through already-computed matches instead of restarting.
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

// pdf.js navigates by destination, so an in-page offset restores exactly at any
// zoom level. `null` scale keeps the current one.
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
    return <PdfJsViewerContent {...props} key={props.url} ref={handleRef} />;
  },
);

const PdfJsViewerContent = forwardRef<PdfJsViewerHandle, PdfJsViewerProps>(
  function PdfJsViewer(
    {
      url,
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
    // Remembers the active query so next/previous can repeat it via "again".
    const queryRef = useRef("");
    // Captured at mount: this instance is remounted per document, so the
    // restored position is fixed for the lifetime of the viewer.
    const initialPositionRef = useRef(initialPosition);
    // Latest callback for the debounced position writer, which closes over mount.
    const onPositionChangeRef = useRef(onPositionChange);
    onPositionChangeRef.current = onPositionChange;
    // Latest highlights for `pagerendered` handlers that close over mount.
    const highlightsRef = useRef(highlights);
    highlightsRef.current = highlights;
    // Shared with the thumbnails rail so pages are not loaded a second time.
    const pdfDocumentRef = useRef<pdfjs.PDFDocumentProxy | null>(null);

    // In preset modes (page-width / page-fit) horizontal overflow is hidden so
    // wider pages in mixed-size PDFs don't create a horizontal scrollbar.
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
          // scrollPageIntoView uses real page geometry, so the jump is exact
          // regardless of which pages have rendered.
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

    // Build the viewer once per document. pdf.js owns all rendering, scrolling
    // and (re)layout from here; React only mounts the container and forwards
    // imperative commands.
    useMountEffect(() => {
      const container = containerRef.current;
      const viewerElement = viewerElementRef.current;
      if (!container || !viewerElement) {
        return;
      }

      let cancelled = false;
      // True while the reader is hidden (display:none) and its scroll box is
      // gone; view-area updates are meaningless until it is shown again.
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

      eventBus.on("pagesinit", () => {
        // Fit width on first layout; resizing re-applies the preset below.
        pdfViewer.currentScaleValue = "page-width";
        setOverflowForPreset(true);
        // Restore the last reading position after scale is applied so the jump
        // uses final page geometry rather than pre-layout estimates.
        const restored = resolveRestoredPosition(
          initialPositionRef.current,
          pdfViewer.pagesCount,
        );
        lastPosition = restored;
        if (restored.page > 1 || restored.top !== 0 || restored.left !== 0) {
          scrollToPosition(pdfViewer, restored);
        }
      });
      const handlePageChanging = (event: { pageNumber: number }) =>
        onPageChange?.(event.pageNumber);
      // pdf.js reports the view area in PDF user space, so the stored offsets
      // survive zoom changes and panel resizes. It fires per scroll frame;
      // debounce before persisting.
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
      // Both events carry the latest match tally; pdf.js fires count updates as
      // matches stream in and control-state updates when the active match moves.
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

      // Virtualized pages are created on demand; re-paint marks each time a
      // page enters the DOM so highlights survive scroll-away / scroll-back.
      const handlePageRendered = () => {
        paintPdfHighlights(viewerElement, highlightsRef.current);
      };
      eventBus.on("pagerendered", handlePageRendered);

      const loadingTask = pdfjs.getDocument({
        url,
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

      // Ctrl/⌘ + scroll wheel steps by ZOOM_STEP; trackpad pinch (which the OS
      // synthesises as ctrlKey wheel events with small fractional deltas) zooms
      // continuously so the gesture feels smooth.
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
        // Anchor the zoom at the cursor: pdf.js relayouts synchronously on
        // scale assignment, so adjust the scroll offsets to keep the document
        // point under the pointer stationary.
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const factor = newScale / cur;
        container.scrollLeft = (container.scrollLeft + x) * factor - x;
        container.scrollTop = (container.scrollTop + y) * factor - y;
      };
      container.addEventListener("wheel", handleWheel, { passive: false });

      // Re-apply the active preset on container resize. Re-assigning the preset
      // recomputes the scale while pdf.js preserves the reading position; a
      // fixed numeric zoom is a no-op here, so manual zoom survives resizes.
      //
      // A tab switch hides the reader with display:none, which destroys the
      // scroll box: offsets reset to 0 and the view area would report page 1.
      // Freeze while collapsed, then navigate back to the remembered position
      // once the container has a size again.
      const resizeObserver = new ResizeObserver(() => {
        if (container.clientHeight === 0) {
          isCollapsed = true;
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

    // Sync external highlight list into page DOM. Legitimate layout effect:
    // pdf.js owns the page nodes; React cannot declare the overlays in JSX.
    useLayoutEffect(() => {
      paintPdfHighlights(viewerElementRef.current, highlights);
    }, [highlights]);

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          setRef(scrollContainerRef, node);
        }}
        // pdf.js needs a positioned, scrollable container as the page offset
        // parent; `absolute inset-0` fills the relative wrapper supplied by the
        // reader layout.
        className="pdfViewer-container absolute inset-0 overflow-y-scroll overflow-x-hidden"
      >
        <div ref={viewerElementRef} className="pdfViewer" />
      </div>
    );
  },
);
