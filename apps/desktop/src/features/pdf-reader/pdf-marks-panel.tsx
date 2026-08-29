import { Bookmark, Highlighter, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { ScrollArea, Text } from "@/components/ui";
import { cn } from "@/lib/utils";
import type {
  PdfDocumentAnnotations,
  PdfHighlight,
  PdfUserBookmark,
} from "./pdf-annotations";
import { PDF_HIGHLIGHT_SWATCH_CSS } from "./pdf-highlight-layer";

interface PdfMarksPanelProps {
  annotations: PdfDocumentAnnotations;
  currentPage: number;
  onSelectPage(pageNumber: number): void;
  onRemoveBookmark(bookmarkId: string): void;
  onRemoveHighlight(highlightId: string): void;
}

function previewText(text: string, maxLength = 80): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1)}…`;
}

export function PdfMarksPanel({
  annotations,
  currentPage,
  onSelectPage,
  onRemoveBookmark,
  onRemoveHighlight,
}: PdfMarksPanelProps) {
  const { t } = useTranslation("editor");
  const hasBookmarks = annotations.bookmarks.length > 0;
  const hasHighlights = annotations.highlights.length > 0;

  if (!hasBookmarks && !hasHighlights) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 px-4 text-center">
        <Text size="meta" tone="muted">
          {t("pdf.marksEmptyTitle")}
        </Text>
        <Text size="meta" tone="muted">
          {t("pdf.marksEmptyDescription")}
        </Text>
      </div>
    );
  }

  return (
    <ScrollArea className="size-full">
      <div className="flex flex-col gap-3 py-2">
        {hasBookmarks ? (
          <section aria-label={t("pdf.bookmarks")}>
            <div className="flex items-center gap-1.5 px-3 pb-1">
              <Bookmark className="size-3.5 text-muted-foreground" />
              <Text size="meta" tone="muted">
                {t("pdf.bookmarks")}
              </Text>
            </div>
            <ul className="flex flex-col">
              {annotations.bookmarks.map((bookmark) => (
                <BookmarkRow
                  key={bookmark.id}
                  bookmark={bookmark}
                  isActive={bookmark.pageNumber === currentPage}
                  onSelectPage={onSelectPage}
                  onRemove={onRemoveBookmark}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {hasHighlights ? (
          <section aria-label={t("pdf.highlights")}>
            <div className="flex items-center gap-1.5 px-3 pb-1">
              <Highlighter className="size-3.5 text-muted-foreground" />
              <Text size="meta" tone="muted">
                {t("pdf.highlights")}
              </Text>
            </div>
            <ul className="flex flex-col">
              {annotations.highlights.map((highlight) => (
                <HighlightRow
                  key={highlight.id}
                  highlight={highlight}
                  isActive={highlight.pageNumber === currentPage}
                  onSelectPage={onSelectPage}
                  onRemove={onRemoveHighlight}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </ScrollArea>
  );
}

interface BookmarkRowProps {
  bookmark: PdfUserBookmark;
  isActive: boolean;
  onSelectPage(pageNumber: number): void;
  onRemove(bookmarkId: string): void;
}

function BookmarkRow({
  bookmark,
  isActive,
  onSelectPage,
  onRemove,
}: BookmarkRowProps) {
  const { t } = useTranslation("editor");
  const label =
    bookmark.label ??
    t("pdf.bookmarkPageLabel", { page: String(bookmark.pageNumber) });

  return (
    <li
      className={cn(
        "group flex items-center gap-0.5 px-1",
        isActive && "bg-accent/50",
      )}
    >
      <button
        type="button"
        onClick={() => onSelectPage(bookmark.pageNumber)}
        className="min-w-0 flex-1 rounded-control px-2 py-1.5 text-start hover:bg-accent/60"
      >
        <Text size="meta" truncate as="span">
          {label}
        </Text>
        <Text size="meta" tone="muted" as="span" className="ms-1 tabular-nums">
          {t("pdf.markPageBadge", { page: String(bookmark.pageNumber) })}
        </Text>
      </button>
      <TitlebarIconButton
        aria-label={t("pdf.removeBookmark")}
        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={() => onRemove(bookmark.id)}
      >
        <Trash2 className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
    </li>
  );
}

interface HighlightRowProps {
  highlight: PdfHighlight;
  isActive: boolean;
  onSelectPage(pageNumber: number): void;
  onRemove(highlightId: string): void;
}

function HighlightRow({
  highlight,
  isActive,
  onSelectPage,
  onRemove,
}: HighlightRowProps) {
  const { t } = useTranslation("editor");

  return (
    <li
      className={cn(
        "group flex items-center gap-0.5 px-1",
        isActive && "bg-accent/50",
      )}
    >
      <button
        type="button"
        onClick={() => onSelectPage(highlight.pageNumber)}
        className="min-w-0 flex-1 rounded-control px-2 py-1.5 text-start hover:bg-accent/60"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full border border-black/10"
            style={{
              backgroundColor: PDF_HIGHLIGHT_SWATCH_CSS[highlight.color],
            }}
          />
          <Text size="meta" truncate as="span" className="min-w-0">
            {previewText(highlight.selectedText)}
          </Text>
        </span>
        <Text size="meta" tone="muted" as="span" className="tabular-nums">
          {t("pdf.markPageBadge", { page: String(highlight.pageNumber) })}
        </Text>
      </button>
      <TitlebarIconButton
        aria-label={t("pdf.removeHighlight")}
        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={() => onRemove(highlight.id)}
      >
        <Trash2 className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
    </li>
  );
}
