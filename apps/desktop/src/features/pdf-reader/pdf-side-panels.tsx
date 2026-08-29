import { useAtom } from "jotai";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ResizeSeparator } from "@/components/resize-separator";
import { beginColumnResize } from "@/components/use-column-resize";
import { cn } from "@/lib/utils";
import type { PdfDocumentAnnotations } from "./pdf-annotations";
import { PdfMarksPanel } from "./pdf-marks-panel";
import type { PdfOutlineNode } from "./pdf-outline";
import { PdfOutlinePanel } from "./pdf-outline-panel";
import { pdfSidePanelWidthAtom } from "./pdf-reader-store";
import { clampPdfSidePanelWidth } from "./pdf-side-panel-width";
import { PdfThumbnailsPanel } from "./pdf-thumbnails-panel";

interface PdfSidePanelsProps {
  outline: PdfOutlineNode[];
  annotations: PdfDocumentAnnotations;
  currentPage: number;
  totalPages: number;
  isOutlineOpen: boolean;
  isMarksOpen: boolean;
  isThumbnailsOpen: boolean;
  onSelectPage(pageNumber: number): void;
  onRemoveBookmark(bookmarkId: string): void;
  onRemoveHighlight(highlightId: string): void;
  renderThumbnail(
    pageNumber: number,
    maxEdgePx: number,
  ): Promise<string | null>;
  onClose(): void;
}

// Left rail for outline, marks, and page thumbnails. Only one panel is open at
// a time; the backdrop dismisses whichever is showing. Width is shared and
// drag-resizable (persisted via pdfSidePanelWidthAtom).
export function PdfSidePanels({
  outline,
  annotations,
  currentPage,
  totalPages,
  isOutlineOpen,
  isMarksOpen,
  isThumbnailsOpen,
  onSelectPage,
  onRemoveBookmark,
  onRemoveHighlight,
  renderThumbnail,
  onClose,
}: PdfSidePanelsProps) {
  const { t } = useTranslation("editor");
  const [width, setWidth] = useAtom(pdfSidePanelWidthAtom);
  const widthRef = useRef(width);
  widthRef.current = width;

  const sidePanelOpen = isOutlineOpen || isMarksOpen || isThumbnailsOpen;

  let closeLabel: string = t("pdf.closeOutline");
  if (isMarksOpen) {
    closeLabel = t("pdf.closeMarks");
  } else if (isThumbnailsOpen) {
    closeLabel = t("pdf.closeThumbnails");
  }

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent) => {
      beginColumnResize(event, {
        edge: "inline-end",
        startWidth: widthRef.current,
        stopPropagation: true,
        clamp: clampPdfSidePanelWidth,
        onWidthChange: setWidth,
      });
    },
    [setWidth],
  );

  return (
    <>
      {outline.length > 0 ? (
        <PdfSidePanelShell
          open={isOutlineOpen}
          width={width}
          resizeLabel={t("pdf.resizeSidePanel")}
          onResizeMouseDown={handleResizeMouseDown}
        >
          <PdfOutlinePanel
            outline={outline}
            currentPage={currentPage}
            onSelectPage={onSelectPage}
          />
        </PdfSidePanelShell>
      ) : null}

      <PdfSidePanelShell
        open={isMarksOpen}
        width={width}
        resizeLabel={t("pdf.resizeSidePanel")}
        onResizeMouseDown={handleResizeMouseDown}
      >
        <PdfMarksPanel
          annotations={annotations}
          currentPage={currentPage}
          onSelectPage={onSelectPage}
          onRemoveBookmark={onRemoveBookmark}
          onRemoveHighlight={onRemoveHighlight}
        />
      </PdfSidePanelShell>

      <PdfSidePanelShell
        open={isThumbnailsOpen}
        width={width}
        resizeLabel={t("pdf.resizeSidePanel")}
        onResizeMouseDown={handleResizeMouseDown}
      >
        {isThumbnailsOpen ? (
          <PdfThumbnailsPanel
            totalPages={totalPages}
            currentPage={currentPage}
            panelWidth={width}
            onSelectPage={onSelectPage}
            renderThumbnail={renderThumbnail}
          />
        ) : null}
      </PdfSidePanelShell>

      {sidePanelOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-[9] cursor-default appearance-none border-none bg-transparent p-0"
          onClick={onClose}
          tabIndex={-1}
          aria-label={closeLabel}
        />
      ) : null}
    </>
  );
}

interface PdfSidePanelShellProps {
  open: boolean;
  width: number;
  resizeLabel: string;
  onResizeMouseDown(event: React.MouseEvent): void;
  children: React.ReactNode;
}

function PdfSidePanelShell({
  open,
  width,
  resizeLabel,
  onResizeMouseDown,
  children,
}: PdfSidePanelShellProps) {
  return (
    <aside
      className={cn(
        // No panel border-e / shadow: match shell chrome so the edge is a
        // single ResizeSeparator line, not a stacked 2px edge.
        "absolute inset-y-0 start-0 z-10 bg-editor-canvas transition-transform duration-200 ease-in-out",
        open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full",
      )}
      style={{ width }}
    >
      <div className="size-full min-h-0 min-w-0 overflow-hidden">
        {children}
      </div>
      {open ? (
        <ResizeSeparator
          ariaLabel={resizeLabel}
          className="z-20"
          position="absolute-end"
          onMouseDown={onResizeMouseDown}
        />
      ) : null}
    </aside>
  );
}
