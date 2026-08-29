import {
  defaultRangeExtractor,
  type Range,
  useVirtualizer,
} from "@tanstack/react-virtual";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AlertCircle, ChevronDown, Search, SearchX } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FileTypeIcon } from "@/components";
import { Badge, EmptyState, Spinner, Text } from "@/components/ui";
import { cn } from "@/lib";
import type { WorkspaceSearchMatch } from "@/lib/types";
import { openFilePreviewAtom } from "../editor-store";
import {
  buildSearchResultRows,
  getHeaderIndexes,
  type SearchResultRow,
} from "./search-result-rows";
import {
  collapsedSearchPathsAtom,
  searchErrorAtom,
  searchQueryAtom,
  searchResultsAtom,
  searchStatusAtom,
} from "./search-store";

interface SearchResultsPaneProps {
  rootPath: string | null;
}

// Fallback row heights for the virtualizer; real heights are measured via
// `measureElement` once each row mounts.
const HEADER_ROW_ESTIMATE = 30;
const MATCH_ROW_ESTIMATE = 26;

function renderHighlightedText(match: WorkspaceSearchMatch) {
  if (match.ranges.length === 0) {
    return match.text;
  }

  const ranges = [...match.ranges].sort(
    (left, right) => left.startColumn - right.startColumn,
  );
  const parts: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range) => {
    const start = Math.max(0, range.startColumn - 1);
    const end = Math.max(start, range.endColumn - 1);

    if (start > cursor) {
      parts.push(match.text.slice(cursor, start));
    }

    parts.push(
      <mark
        className="rounded-control bg-editor-tab-active-bg px-0.5 text-editor-fg"
        key={`${match.filePath}-${match.line}-${range.startColumn}-${range.endColumn}`}
      >
        {match.text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });

  if (cursor < match.text.length) {
    parts.push(match.text.slice(cursor));
  }

  return parts;
}

function HeaderRow({
  row,
}: {
  row: Extract<SearchResultRow, { kind: "header" }>;
}) {
  const { t } = useTranslation("search");
  const [collapsedPaths, setCollapsedPaths] = useAtom(collapsedSearchPathsAtom);
  const expanded = !collapsedPaths.has(row.filePath);

  const toggleExpanded = () => {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(row.filePath)) {
        next.delete(row.filePath);
      } else {
        next.add(row.filePath);
      }
      return next;
    });
  };

  return (
    <button
      aria-expanded={expanded}
      aria-label={t("fullText.fileMatchCount", { count: row.matchCount })}
      className="flex w-full min-w-0 items-center gap-1.5 bg-editor-canvas px-2 py-1.5 text-start transition-colors hover:bg-editor-tab-hover-bg"
      onClick={toggleExpanded}
      type="button"
    >
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 text-editor-fg-subtle transition-transform",
          !expanded && "-rotate-90 rtl:rotate-90",
        )}
      />
      <FileTypeIcon path={row.relativePath} className="size-3.5 shrink-0" />
      <Text
        className="min-w-0 flex-1 font-mono"
        size="body"
        tone="primary"
        truncate
      >
        {row.relativePath}
      </Text>
      <Badge
        className="min-w-5 bg-primary/10 px-1.5 text-2xs text-primary"
        variant="default"
      >
        {row.matchCount}
      </Badge>
    </button>
  );
}

function MatchRow({
  row,
}: {
  row: Extract<SearchResultRow, { kind: "match" }>;
}) {
  const openPreview = useSetAtom(openFilePreviewAtom);
  const { match } = row;

  return (
    <button
      className="flex w-full min-w-0 items-start gap-2 px-2 py-1 text-start text-body hover:bg-editor-tab-hover-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() =>
        openPreview({
          endLine: match.line,
          filePath: match.filePath,
          startLine: match.line,
        })
      }
      type="button"
    >
      <span className="w-10 shrink-0 text-end font-mono text-meta text-editor-fg-muted">
        {match.line}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-body text-editor-fg">
        {renderHighlightedText(match)}
      </span>
    </button>
  );
}

export function SearchResultsPane({ rootPath }: SearchResultsPaneProps) {
  const { t } = useTranslation("search");
  const query = useAtomValue(searchQueryAtom);
  const status = useAtomValue(searchStatusAtom);
  const error = useAtomValue(searchErrorAtom);
  const results = useAtomValue(searchResultsAtom);
  const collapsedPaths = useAtomValue(collapsedSearchPathsAtom);
  const trimmedQuery = query.trim();

  const rows = useMemo(
    () =>
      buildSearchResultRows([...results.entries()], rootPath, collapsedPaths),
    [results, rootPath, collapsedPaths],
  );
  const headerIndexes = useMemo(() => getHeaderIndexes(rows), [rows]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Index of the header pinned to the top edge; updated by the range extractor.
  const activeStickyIndexRef = useRef(0);

  const rangeExtractor = useCallback(
    (range: Range) => {
      const active =
        [...headerIndexes]
          .reverse()
          .find((index) => index <= range.startIndex) ?? 0;
      activeStickyIndexRef.current = active;
      const indexes = new Set([active, ...defaultRangeExtractor(range)]);
      return [...indexes].sort((left, right) => left - right);
    },
    [headerIndexes],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) =>
      rows[index]?.kind === "header" ? HEADER_ROW_ESTIMATE : MATCH_ROW_ESTIMATE,
    getScrollElement: () => scrollRef.current,
    overscan: 16,
    rangeExtractor,
  });

  if (!rootPath) {
    return (
      <EmptyState
        className="min-h-40 flex-1"
        description={t("empty.noWorkspace.description")}
        icon={<Search />}
        title={t("empty.noWorkspace.title")}
      />
    );
  }

  if (!trimmedQuery) {
    return (
      <EmptyState
        className="min-h-40 flex-1"
        description={t("fullText.emptyQueryDescription")}
        icon={<Search />}
        title={t("fullText.emptyQueryTitle")}
      />
    );
  }

  if (status === "error") {
    return (
      <EmptyState
        className="min-h-40 flex-1"
        description={error ?? t("fullText.errorDescription")}
        icon={<AlertCircle />}
        title={t("fullText.errorTitle")}
      />
    );
  }

  if (rows.length === 0 && status === "running") {
    return (
      <div className="flex min-h-40 flex-1 items-center justify-center gap-2 text-editor-fg-muted">
        <Spinner size="sm" />
        <Text size="body" tone="muted">
          {t("fullText.searching")}
        </Text>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        className="min-h-40 flex-1"
        description={t("fullText.noMatchesDescription")}
        icon={<SearchX />}
        title={t("fullText.noMatchesTitle")}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto" ref={scrollRef}>
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index];
          const isStickyHeader =
            row.kind === "header" &&
            activeStickyIndexRef.current === virtualItem.index;

          return (
            <div
              className={
                isStickyHeader
                  ? "sticky top-0 z-10 w-full"
                  : "absolute start-0 top-0 w-full"
              }
              data-index={virtualItem.index}
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              style={
                isStickyHeader
                  ? undefined
                  : { transform: `translateY(${virtualItem.start}px)` }
              }
            >
              {row.kind === "header" ? (
                <HeaderRow row={row} />
              ) : (
                <MatchRow row={row} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
