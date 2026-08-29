import { useAtomValue, useSetAtom } from "jotai";
import { FileWarning } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui";
import { insertMarkdownIntoActiveNoteAtom } from "@/features/notes/note-body-insert";
import { useDocumentEvent, useMountEffect } from "@/lib";
import {
  findBookmarkForPage,
  getDocumentAnnotations,
  type PdfHighlightColor,
} from "./pdf-annotations";
import {
  buildPdfNoteCitationMarkdown,
  noteTitleFromPdfPath,
} from "./pdf-note-citation";
import type { PdfOutlineNode } from "./pdf-outline";
import {
  addPdfHighlightAtom,
  hydratePdfAnnotationsAtom,
  pdfAnnotationsAtom,
  pdfLastHighlightColorAtom,
  pdfReadingPositionsAtom,
  removePdfBookmarkAtom,
  removePdfHighlightAtom,
  setPdfReadingPositionAtom,
  togglePdfBookmarkForPageAtom,
} from "./pdf-reader-store";
import type { PdfReadingPosition } from "./pdf-reading-position";
import { MAX_SCALE, MIN_SCALE } from "./pdf-scale";
import { PdfSearchBar } from "./pdf-search-bar";
import { PdfSelectionAnchor } from "./pdf-selection-anchor";
import { PdfSelectionToolbar } from "./pdf-selection-toolbar";
import { PdfSidePanels } from "./pdf-side-panels";
import { PdfToolbar } from "./pdf-toolbar";
import type { PdfFindMatches, PdfJsViewerHandle } from "./renderer";
import { usePdfData } from "./use-pdf-data";
import { usePdfSelection } from "./use-pdf-selection";

// pdf.js (worker + canvas) is loaded lazily so the heavy code is only evaluated
// when a PDF is actually opened. This keeps it out of the main renderer chunk
// and out of jsdom test runs, where pdf.js's reliance on DOMMatrix/canvas would
// otherwise throw at import time.
const PdfJsViewer = lazy(() =>
  import("./renderer").then((module) => ({ default: module.PdfJsViewer })),
);

const SCALE_EPSILON = 0.01;

interface PdfViewerProps {
  filePath: string;
  // Whether the PDF reader view is currently visible. The component stays
  // mounted when the panel switches to another view, so document-level
  // shortcuts must not fire while hidden.
  isActive: boolean;
  onInsertTextToChat?(text: string): boolean;
}

export function PdfViewer(props: PdfViewerProps) {
  // Remount on file change so per-document view state (zoom, outline, search)
  // resets without an effect. Reading page is restored from persisted storage.
  return <PdfViewerContent key={props.filePath} {...props} />;
}

function PdfViewerContent({
  filePath,
  isActive,
  onInsertTextToChat,
}: PdfViewerProps) {
  const { t } = useTranslation("editor");
  const viewerHandleRef = useRef<PdfJsViewerHandle | null>(null);

  const { url, status, setStatus } = usePdfData(filePath);
  const readingPositions = useAtomValue(pdfReadingPositionsAtom);
  const setReadingPosition = useSetAtom(setPdfReadingPositionAtom);
  const annotationsByPath = useAtomValue(pdfAnnotationsAtom);
  const lastHighlightColor = useAtomValue(pdfLastHighlightColorAtom);
  const hydrateAnnotations = useSetAtom(hydratePdfAnnotationsAtom);
  const toggleBookmark = useSetAtom(togglePdfBookmarkForPageAtom);
  const removeBookmark = useSetAtom(removePdfBookmarkAtom);
  const addHighlight = useSetAtom(addPdfHighlightAtom);
  const removeHighlight = useSetAtom(removePdfHighlightAtom);
  const insertMarkdownIntoNote = useSetAtom(insertMarkdownIntoActiveNoteAtom);

  // PdfViewer remounts per filePath; load marks from userData once on mount.
  useMountEffect(() => {
    void hydrateAnnotations(filePath);
  });

  const documentAnnotations = useMemo(
    () => getDocumentAnnotations(annotationsByPath, filePath),
    [annotationsByPath, filePath],
  );

  // Seed the toolbar from the last stored page so the indicator does not flash
  // "1" while pdf.js finishes its first layout and navigates. The viewer
  // clamps against the real page count once the document is ready.
  const initialPosition = readingPositions[filePath];
  const initialPage = initialPosition?.page ?? 1;
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [scale, setScale] = useState(1);
  const [outline, setOutline] = useState<PdfOutlineNode[]>([]);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isMarksOpen, setIsMarksOpen] = useState(false);
  const [isThumbnailsOpen, setIsThumbnailsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [findMatches, setFindMatches] = useState<PdfFindMatches>({
    current: 0,
    total: 0,
  });

  const {
    selection,
    clearSelection,
    containerRef: scrollRef,
  } = usePdfSelection(documentAnnotations.highlights);

  const isCurrentPageBookmarked = Boolean(
    findBookmarkForPage(documentAnnotations, currentPage),
  );

  const handleReady = useCallback(
    (nextNumPages: number) => {
      setNumPages(nextNumPages);
      setStatus("ready");
    },
    [setStatus],
  );

  const handlePageChange = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
  }, []);

  const handlePositionChange = useCallback(
    (position: PdfReadingPosition) => {
      setReadingPosition({ filePath, position });
    },
    [filePath, setReadingPosition],
  );

  const handleError = useCallback(() => {
    setStatus("error");
  }, [setStatus]);

  const handleZoomIn = useCallback(() => viewerHandleRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(
    () => viewerHandleRef.current?.zoomOut(),
    [],
  );
  const handleFitWidth = useCallback(
    () => viewerHandleRef.current?.fitWidth(),
    [],
  );
  const handleResetZoom = useCallback(
    () => viewerHandleRef.current?.resetZoom(),
    [],
  );

  // Outline, marks, and thumbnails share the left rail; opening one closes the
  // others so only a single drawer is visible.
  const handleToggleOutline = useCallback(() => {
    setIsOutlineOpen((open) => {
      const next = !open;
      if (next) {
        setIsMarksOpen(false);
        setIsThumbnailsOpen(false);
      }
      return next;
    });
  }, []);

  const handleToggleMarks = useCallback(() => {
    setIsMarksOpen((open) => {
      const next = !open;
      if (next) {
        setIsOutlineOpen(false);
        setIsThumbnailsOpen(false);
      }
      return next;
    });
  }, []);

  const handleToggleThumbnails = useCallback(() => {
    setIsThumbnailsOpen((open) => {
      const next = !open;
      if (next) {
        setIsOutlineOpen(false);
        setIsMarksOpen(false);
      }
      return next;
    });
  }, []);

  const handleRenderThumbnail = useCallback(
    async (pageNumber: number, maxEdgePx: number) => {
      return (
        (await viewerHandleRef.current?.renderThumbnail(
          pageNumber,
          maxEdgePx,
        )) ?? null
      );
    },
    [],
  );

  // pdf.js navigates by real page geometry, so the jump is exact regardless of
  // which pages have rendered.
  const handleSelectPage = useCallback((pageNumber: number) => {
    viewerHandleRef.current?.goToPage(pageNumber);
  }, []);

  const handleFitPage = useCallback(
    () => viewerHandleRef.current?.fitPage(),
    [],
  );

  const handleToggleBookmark = useCallback(() => {
    toggleBookmark({ filePath, pageNumber: currentPage });
  }, [toggleBookmark, filePath, currentPage]);

  const handleRemoveBookmark = useCallback(
    (bookmarkId: string) => {
      removeBookmark({ filePath, bookmarkId });
    },
    [removeBookmark, filePath],
  );

  const handleRemoveHighlight = useCallback(
    (highlightId: string) => {
      removeHighlight({ filePath, highlightId });
      if (
        selection?.kind === "highlight" &&
        selection.highlightId === highlightId
      ) {
        clearSelection();
      }
    },
    [removeHighlight, filePath, selection, clearSelection],
  );

  const resetSearch = useCallback(() => {
    setSearchQuery("");
    setFindMatches({ current: 0, total: 0 });
    viewerHandleRef.current?.clearFind();
  }, []);

  const handleToggleSearch = useCallback(() => {
    setIsSearchOpen((open) => {
      if (open) {
        resetSearch();
      }
      return !open;
    });
  }, [resetSearch]);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    resetSearch();
  }, [resetSearch]);

  const handleQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (query) {
      viewerHandleRef.current?.find(query);
    } else {
      setFindMatches({ current: 0, total: 0 });
      viewerHandleRef.current?.clearFind();
    }
  }, []);

  const handleFindNext = useCallback(
    () => viewerHandleRef.current?.findNext(),
    [],
  );
  const handleFindPrevious = useCallback(
    () => viewerHandleRef.current?.findPrevious(),
    [],
  );

  // ⌘F / Ctrl+F opens the in-document find bar while a PDF is shown, mirroring
  // the platform find shortcut and preventing the browser's own find overlay.
  // Escape dismisses the text / highlight action bubble.
  const handleViewerKeydown = useCallback(
    (event: KeyboardEvent) => {
      if (!isActive || status !== "ready") {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && selection) {
        event.preventDefault();
        clearSelection();
      }
    },
    [isActive, status, selection, clearSelection],
  );
  useDocumentEvent("keydown", handleViewerKeydown);

  const handleAddSelection = useCallback(() => {
    if (selection?.kind !== "text") {
      return;
    }
    if (onInsertTextToChat?.(selection.selectedText)) {
      clearSelection();
    }
  }, [selection, onInsertTextToChat, clearSelection]);

  const handleAddSelectionToNote = useCallback(() => {
    if (selection?.kind !== "text") {
      return;
    }

    const pageNumber = selection.pageNumber ?? currentPage;
    const markdown = buildPdfNoteCitationMarkdown({
      filePath,
      pageNumber:
        typeof pageNumber === "number" && pageNumber >= 1 ? pageNumber : null,
      selectedText: selection.selectedText,
    });
    if (!markdown) {
      return;
    }

    void (async () => {
      const result = await insertMarkdownIntoNote({
        markdown,
        createTitle: noteTitleFromPdfPath(filePath),
      });
      if (result === "inserted") {
        toast.success(t("pdf.addedToNote"));
        clearSelection();
        window.getSelection()?.removeAllRanges();
        return;
      }
      if (result === "created") {
        toast.success(t("pdf.addedToNewNote"));
        clearSelection();
        window.getSelection()?.removeAllRanges();
        return;
      }
      if (result === "no-root") {
        toast.error(t("pdf.addToNoteNoActiveNote"));
        return;
      }
      toast.error(t("pdf.addToNoteFailed"));
    })();
  }, [
    selection,
    insertMarkdownIntoNote,
    t,
    currentPage,
    filePath,
    clearSelection,
  ]);

  const handleHighlightSelection = useCallback(
    (color: PdfHighlightColor) => {
      if (selection?.kind !== "text") {
        return;
      }
      if (!selection.pageNumber || !selection.quads) {
        return;
      }
      const created = addHighlight({
        filePath,
        pageNumber: selection.pageNumber,
        selectedText: selection.selectedText,
        quads: selection.quads,
        color,
      });
      if (created) {
        clearSelection();
        window.getSelection()?.removeAllRanges();
      }
    },
    [selection, addHighlight, filePath, clearSelection],
  );

  const handleRemoveActiveHighlight = useCallback(() => {
    if (selection?.kind !== "highlight") {
      return;
    }
    removeHighlight({ filePath, highlightId: selection.highlightId });
    clearSelection();
  }, [selection, removeHighlight, filePath, clearSelection]);

  const closeSidePanel = useCallback(() => {
    setIsOutlineOpen(false);
    setIsMarksOpen(false);
    setIsThumbnailsOpen(false);
  }, []);

  if (status === "error") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-editor-canvas">
        <EmptyState
          icon={<FileWarning />}
          title={t("pdf.loadErrorTitle")}
          description={t("pdf.loadErrorDescription")}
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-editor-canvas">
      {/*
        Drop toolbar DOM while the reader tab is inactive. Keep-alive still
        holds the pdf.js document; only chrome unmounts so icons never lag
        under the next right-panel view after a tab switch.
      */}
      {status === "ready" && isActive ? (
        <PdfToolbar
          currentPage={currentPage}
          totalPages={numPages}
          scale={scale}
          canZoomIn={scale < MAX_SCALE - SCALE_EPSILON}
          canZoomOut={scale > MIN_SCALE + SCALE_EPSILON}
          hasOutline={outline.length > 0}
          isOutlineOpen={isOutlineOpen}
          isMarksOpen={isMarksOpen}
          isThumbnailsOpen={isThumbnailsOpen}
          isCurrentPageBookmarked={isCurrentPageBookmarked}
          isSearchOpen={isSearchOpen}
          onToggleOutline={handleToggleOutline}
          onToggleMarks={handleToggleMarks}
          onToggleThumbnails={handleToggleThumbnails}
          onToggleBookmark={handleToggleBookmark}
          onToggleSearch={handleToggleSearch}
          onGoToPage={handleSelectPage}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onFitWidth={handleFitWidth}
          onFitPage={handleFitPage}
        />
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PdfSidePanels
          outline={outline}
          annotations={documentAnnotations}
          currentPage={currentPage}
          totalPages={numPages}
          isOutlineOpen={isOutlineOpen}
          isMarksOpen={isMarksOpen}
          isThumbnailsOpen={isThumbnailsOpen}
          onSelectPage={handleSelectPage}
          onRemoveBookmark={handleRemoveBookmark}
          onRemoveHighlight={handleRemoveHighlight}
          renderThumbnail={handleRenderThumbnail}
          onClose={closeSidePanel}
        />

        <div className="absolute inset-0">
          {url ? (
            <Suspense fallback={null}>
              <PdfJsViewer
                ref={viewerHandleRef}
                url={url}
                initialPosition={initialPosition}
                highlights={documentAnnotations.highlights}
                scrollContainerRef={scrollRef}
                onReady={handleReady}
                onError={handleError}
                onOutlineLoaded={setOutline}
                onPageChange={handlePageChange}
                onPositionChange={handlePositionChange}
                onScaleChange={setScale}
                onFindMatchesChange={setFindMatches}
              />
            </Suspense>
          ) : null}

          {isSearchOpen ? (
            <PdfSearchBar
              query={searchQuery}
              matches={findMatches}
              onQueryChange={handleQueryChange}
              onNext={handleFindNext}
              onPrevious={handleFindPrevious}
              onClose={handleCloseSearch}
            />
          ) : null}
        </div>
      </div>

      {selection?.kind === "text" ? (
        <PdfSelectionAnchor anchor={selection.anchor}>
          <PdfSelectionToolbar
            mode="text"
            canHighlight={
              selection.pageNumber != null && selection.quads != null
            }
            preferredColor={lastHighlightColor}
            onAddToChat={handleAddSelection}
            onAddToNote={handleAddSelectionToNote}
            onHighlight={handleHighlightSelection}
          />
        </PdfSelectionAnchor>
      ) : null}

      {selection?.kind === "highlight" ? (
        <PdfSelectionAnchor anchor={selection.anchor}>
          <PdfSelectionToolbar
            mode="highlight"
            onRemove={handleRemoveActiveHighlight}
          />
        </PdfSelectionAnchor>
      ) : null}
    </div>
  );
}
