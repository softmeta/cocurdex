import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { Input, Text } from "@/components/ui";
import type { PdfFindMatches } from "./renderer";

interface PdfSearchBarProps {
  query: string;
  matches: PdfFindMatches;
  onQueryChange(query: string): void;
  onNext(): void;
  onPrevious(): void;
  onClose(): void;
}

// In-document find bar. Enter steps to the next match, Shift+Enter to the
// previous, Escape closes. Match tally streams in from pdf.js as pages are
// scanned, so the count can lag the query by a frame.
export function PdfSearchBar({
  query,
  matches,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: PdfSearchBarProps) {
  const { t } = useTranslation("editor");

  const hasQuery = query.length > 0;
  const countLabel =
    hasQuery && matches.total === 0
      ? t("pdf.searchNoResults")
      : t("pdf.searchMatches", {
          current: String(matches.current),
          total: String(matches.total),
        });

  return (
    <div className="absolute inset-e-2 top-2 z-10 flex items-center gap-1 rounded-control border border-editor-border bg-editor-canvas p-1 shadow-sm">
      <Input
        autoFocus
        aria-label={t("pdf.search")}
        placeholder={t("pdf.search")}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) {
              onPrevious();
            } else {
              onNext();
            }
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        className="h-7 w-44"
      />
      <Text
        size="meta"
        tone="muted"
        className="min-w-14 text-center tabular-nums"
      >
        {hasQuery ? countLabel : null}
      </Text>
      <TitlebarIconButton
        aria-label={t("pdf.searchPrevious")}
        disabled={matches.total === 0}
        onClick={onPrevious}
      >
        <ChevronUp className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={t("pdf.searchNext")}
        disabled={matches.total === 0}
        onClick={onNext}
      >
        <ChevronDown className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
      <TitlebarIconButton aria-label={t("pdf.searchClose")} onClick={onClose}>
        <X className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
    </div>
  );
}
