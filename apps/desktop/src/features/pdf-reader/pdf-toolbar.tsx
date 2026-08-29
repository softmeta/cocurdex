import {
  Bookmark,
  BookmarkCheck,
  GalleryVertical,
  List,
  Minus,
  PanelLeft,
  Plus,
  RectangleVertical,
  Scaling,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
  titlebarIconButtonClassName,
} from "@/app/layout/titlebar-icon-button";
import { Text } from "@/components/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib";
import { PdfPageJumpInput } from "./pdf-page-jump-input";

// Match top tab tooltips: delay so sweeping the toolbar does not flash tips.
const PDF_TOOLBAR_TOOLTIP_DELAY_MS = 500;

interface PdfToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  // Whether the document exposes an outline; the toggle is hidden otherwise.
  hasOutline: boolean;
  isOutlineOpen: boolean;
  isMarksOpen: boolean;
  isThumbnailsOpen: boolean;
  isCurrentPageBookmarked: boolean;
  isSearchOpen: boolean;
  onToggleOutline(): void;
  onToggleMarks(): void;
  onToggleThumbnails(): void;
  onToggleBookmark(): void;
  onToggleSearch(): void;
  onGoToPage(pageNumber: number): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onResetZoom(): void;
  onFitWidth(): void;
  onFitPage(): void;
}

function ToolbarIconButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <TitlebarIconButton
            active={active}
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

export function PdfToolbar({
  currentPage,
  totalPages,
  scale,
  canZoomIn,
  canZoomOut,
  hasOutline,
  isOutlineOpen,
  isMarksOpen,
  isThumbnailsOpen,
  isCurrentPageBookmarked,
  isSearchOpen,
  onToggleOutline,
  onToggleMarks,
  onToggleThumbnails,
  onToggleBookmark,
  onToggleSearch,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitWidth,
  onFitPage,
}: PdfToolbarProps) {
  const { t } = useTranslation("editor");
  const isAtActualSize = Math.abs(scale - 1) < 0.005;
  const resetZoomLabel = t("pdf.resetZoom");

  return (
    <TooltipProvider delay={PDF_TOOLBAR_TOOLTIP_DELAY_MS}>
      <div className="flex items-center justify-between gap-2 border-b border-editor-border px-2 py-1">
        <div className="flex items-center gap-1">
          {hasOutline ? (
            <ToolbarIconButton
              active={isOutlineOpen}
              label={t("pdf.toggleOutline")}
              onClick={onToggleOutline}
            >
              <PanelLeft className={TITLEBAR_ICON_GLYPH_CLASS} />
            </ToolbarIconButton>
          ) : null}
          <ToolbarIconButton
            active={isThumbnailsOpen}
            label={t("pdf.toggleThumbnails")}
            onClick={onToggleThumbnails}
          >
            <GalleryVertical className={TITLEBAR_ICON_GLYPH_CLASS} />
          </ToolbarIconButton>
          <ToolbarIconButton
            active={isMarksOpen}
            label={t("pdf.toggleMarks")}
            onClick={onToggleMarks}
          >
            <List className={TITLEBAR_ICON_GLYPH_CLASS} />
          </ToolbarIconButton>
          <PdfPageJumpInput
            currentPage={currentPage}
            totalPages={totalPages}
            onGoToPage={onGoToPage}
          />
        </div>
        <div className="flex items-center gap-1">
          <ToolbarIconButton
            active={isCurrentPageBookmarked}
            label={
              isCurrentPageBookmarked
                ? t("pdf.removePageBookmark")
                : t("pdf.addPageBookmark")
            }
            onClick={onToggleBookmark}
          >
            {isCurrentPageBookmarked ? (
              <BookmarkCheck className={TITLEBAR_ICON_GLYPH_CLASS} />
            ) : (
              <Bookmark className={TITLEBAR_ICON_GLYPH_CLASS} />
            )}
          </ToolbarIconButton>
          <ToolbarIconButton
            active={isSearchOpen}
            label={t("pdf.toggleSearch")}
            onClick={onToggleSearch}
          >
            <Search className={TITLEBAR_ICON_GLYPH_CLASS} />
          </ToolbarIconButton>
          <ToolbarIconButton
            disabled={!canZoomOut}
            label={t("pdf.zoomOut")}
            onClick={onZoomOut}
          >
            <Minus className={TITLEBAR_ICON_GLYPH_CLASS} />
          </ToolbarIconButton>
          {isAtActualSize ? (
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
                onClick={onResetZoom}
                type="button"
              >
                <Text size="meta">{Math.round(scale * 100)}%</Text>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {resetZoomLabel}
              </TooltipContent>
            </Tooltip>
          )}
          <ToolbarIconButton label={t("pdf.fitWidth")} onClick={onFitWidth}>
            <Scaling className={TITLEBAR_ICON_GLYPH_CLASS} />
          </ToolbarIconButton>
          <ToolbarIconButton label={t("pdf.fitPage")} onClick={onFitPage}>
            <RectangleVertical className={TITLEBAR_ICON_GLYPH_CLASS} />
          </ToolbarIconButton>
          <ToolbarIconButton
            disabled={!canZoomIn}
            label={t("pdf.zoomIn")}
            onClick={onZoomIn}
          >
            <Plus className={TITLEBAR_ICON_GLYPH_CLASS} />
          </ToolbarIconButton>
        </div>
      </div>
    </TooltipProvider>
  );
}
