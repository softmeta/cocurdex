import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useSetAtom } from "jotai";
import type { CSSProperties, RefObject } from "react";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { GitChangeFileDiff } from "./git-changes-file-diff";
import {
  CARD_CHROME_HEIGHT,
  COLLAPSED_ENTRY_HEIGHT,
  DIFF_GAP_BLOCK,
  entryItemKey,
  estimateEntryHeight,
  type GitChangeEntry,
  type GitDiffStyle,
} from "./git-changes-model";
import {
  consumeGitRevealAtom,
  type GitFileReveal,
  gitSelectedPathAtom,
} from "./git-changes-store";

// The pinned row owns the top edge of the scrollport. Cards sit in rows whose gap
// is below the card (`pb-2`), so a row whose top is within that empty band of
// the edge is the pinned one — plus a pixel for the fractional offsets a scroll
// can land on.
const ROW_GAP_PX = 8;
const PINNED_ROW_TOLERANCE_PX = ROW_GAP_PX + 1;

// A reveal scrolls to where its target is *estimated* to be; the rows between the
// reader and the target get measured as they mount, which moves the target. The
// scroll is re-applied while that settles so the jump ends on the real position.
const REVEAL_CORRECTION_INTERVAL_MS = 50;
const REVEAL_CORRECTION_ATTEMPTS = 8;

// Rows kept mounted past the viewport. They double as the pre-mount band: on
// settle they open ahead of the reader, so each one may carry a mounted pierre
// diff — this stays deliberately small.
const OVERSCAN = 2;

// Scrolling itself stays free of diff work: mounting a pierre diff is heavy
// enough to drop frames. The check therefore runs once the reader pauses — the
// files they stopped on open under a stationary viewport instead of fighting
// the scroll.
const SCROLL_SETTLE_MS = 140;

export interface GitChangesDiffStackProps {
  entries: GitChangeEntry[];
  diffStyle: GitDiffStyle;
  wrap: boolean;
  expandUnchanged: boolean;
  folded: ReadonlySet<string>;
  // A pending "jump to this file" request. The stack is its only consumer:
  // it unfolds the file, scrolls to it and clears the request.
  reveal: GitFileReveal | null;
  actionsEnabled: boolean;
  onFold: (path: string) => void;
  onUnfold: (path: string) => void;
  onOpenFile: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  diffThemeType: "light" | "dark";
}

function samePaths(current: ReadonlySet<string>, next: string[]): boolean {
  return (
    current.size === next.length && next.every((path) => current.has(path))
  );
}

// Scroll position is an external system, and only rows near the viewport are
// mounted, so scrolling to a file goes through the virtualizer instead of a row
// ref. A request stays pending until its file reaches the loaded entry list:
// a review can arrive before the scope's diff has finished loading.
function useRevealScroll(
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>,
  scrollElementRef: RefObject<HTMLDivElement | null>,
  entries: GitChangeEntry[],
  reveal: GitFileReveal | null,
  onUnfold: (path: string) => void,
  consumeReveal: (token: number) => void,
) {
  const resolvedTokenRef = useRef<number | null>(null);
  const correctionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correctingIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (reveal === null || resolvedTokenRef.current === reveal.token) return;
    const index = entries.findIndex((entry) => entry.path === reveal.path);
    if (index < 0) {
      // The list is loaded and the file is not in it: drop the request instead
      // of replaying it on the next scope.
      if (entries.length > 0) {
        resolvedTokenRef.current = reveal.token;
        consumeReveal(reveal.token);
      }
      return;
    }
    const item = virtualizer.measurementsCache[index];
    const viewport = scrollElementRef.current;
    if (!item || !viewport) return;
    resolvedTokenRef.current = reveal.token;
    onUnfold(reveal.path);
    consumeReveal(reveal.token);
    const top = viewport.scrollTop;
    const bottom = top + viewport.clientHeight;
    // Fully visible or covering the whole viewport: the reader is already on
    // it either way.
    if (item.start >= top && item.end <= bottom) return;
    if (item.start < top && item.end > bottom) return;
    // A file taller than the viewport always lands on its header: aligning to
    // its end would drop the reader at the far edge of the diff they asked for.
    const tallerThanViewport = item.end - item.start > viewport.clientHeight;
    const align =
      tallerThanViewport || item.start < top || item.start >= bottom
        ? "start"
        : "end";

    const correctUntilStable = (targetIndex: number) => {
      let applied = virtualizer.measurementsCache[targetIndex]?.start;
      let attempts = 0;
      correctingIndexRef.current = targetIndex;
      const tick = () => {
        const current = virtualizer.measurementsCache[targetIndex]?.start;
        if (
          current !== undefined &&
          applied !== undefined &&
          Math.abs(current - applied) > 1
        ) {
          applied = current;
          virtualizer.scrollToIndex(targetIndex, { align });
        }
        attempts += 1;
        if (attempts >= REVEAL_CORRECTION_ATTEMPTS) {
          correctingIndexRef.current = null;
          correctionTimerRef.current = null;
          return;
        }
        correctionTimerRef.current = setTimeout(
          tick,
          REVEAL_CORRECTION_INTERVAL_MS,
        );
      };
      if (correctionTimerRef.current !== null) {
        clearTimeout(correctionTimerRef.current);
      }
      correctionTimerRef.current = setTimeout(
        tick,
        REVEAL_CORRECTION_INTERVAL_MS,
      );
    };

    virtualizer.scrollToIndex(index, { align });
    correctUntilStable(index);
  }, [reveal, entries, virtualizer, scrollElementRef, onUnfold, consumeReveal]);

  useEffect(
    () => () => {
      if (correctionTimerRef.current !== null) {
        clearTimeout(correctionTimerRef.current);
      }
    },
    [],
  );

  return correctingIndexRef;
}

interface MountWindow {
  mounted: ReadonlySet<string>;
  followReader: () => void;
  scheduleSettle: (delay: number) => void;
  toggleRow: (path: string) => void;
}

interface MountWindowOptions {
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  entries: GitChangeEntry[];
  folded: ReadonlySet<string>;
  setSelectedPath: (update: (previous: string | null) => string | null) => void;
  onFold: (path: string) => void;
  onUnfold: (path: string) => void;
  // Set while a reveal is re-aligning the scroll: the row at the top edge is
  // then mid-correction and must not steal the selection from the reveal.
  correctingIndexRef: RefObject<number | null>;
}

// Which rows may render a diff follows the viewport, not the change set: the
// rows the virtualizer has mounted right now are the ones the reader can read,
// and a row that leaves the band returns to its placeholder. A deferred row
// already holds the height it will have once open, so mounting and unmounting
// leave the rows around it where they are.
function useMountWindow({
  virtualizer,
  scrollElementRef,
  entries,
  folded,
  setSelectedPath,
  onFold,
  onUnfold,
  correctingIndexRef,
}: MountWindowOptions): MountWindow {
  const [mounted, setMounted] = useState<ReadonlySet<string>>(new Set());
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The row holding the top edge of the viewport is the one pinned under the
  // stack's sticky header, so it is the file the reader is on: the file index
  // beside the stack selects it and follows the reader through this.
  const followReader = useCallback(() => {
    const viewport = scrollElementRef.current;
    if (!viewport) return;
    if (correctingIndexRef.current !== null) return;
    const arriving = virtualizer.getVirtualItemForOffset(
      viewport.scrollTop + PINNED_ROW_TOLERANCE_PX,
    );
    const topPath = arriving ? entries[arriving.index]?.path : undefined;
    if (topPath === undefined) return;
    setSelectedPath((previous) => (previous === topPath ? previous : topPath));
  }, [
    virtualizer,
    scrollElementRef,
    entries,
    setSelectedPath,
    correctingIndexRef,
  ]);

  const mountBand = useCallback(() => {
    followReader();
    const band: string[] = [];
    for (const item of virtualizer.getVirtualItems()) {
      const path = entries[item.index]?.path;
      if (path === undefined || folded.has(path)) continue;
      band.push(path);
    }
    // Mounting a diff is heavy, so the update yields to scrolling input.
    startTransition(() => {
      setMounted((previous) =>
        samePaths(previous, band) ? previous : new Set(band),
      );
    });
  }, [followReader, virtualizer, entries, folded]);

  const scheduleSettle = useCallback(
    (delay: number) => {
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        mountBand();
      }, delay);
    },
    [mountBand],
  );

  const virtualItems = virtualizer.getVirtualItems();
  // Rows that mount while the reader is stationary — first paint, a diff
  // reload, an option toggle — become real diffs right away; rows passing by
  // mid-scroll stay deferred until the scroll settles, which the timer covers.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the mounted band is read from the virtualizer at run time; this render's items are the trigger for re-checking it
  useEffect(() => {
    if (virtualizer.isScrolling) return;
    mountBand();
  }, [virtualItems, entries, mountBand, virtualizer]);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    },
    [],
  );

  const toggleRow = useCallback(
    (path: string) => {
      if (folded.has(path)) {
        setMounted((previous) => new Set(previous).add(path));
        onUnfold(path);
        return;
      }
      if (mounted.has(path)) {
        onFold(path);
        return;
      }
      setMounted((previous) => new Set(previous).add(path));
    },
    [folded, mounted, onFold, onUnfold],
  );

  return { mounted, followReader, scheduleSettle, toggleRow };
}

// Every changed file stacked in one scrolling column: only the rows near the
// viewport are mounted, so a whole change set can be read by scrolling. The
// file index optionally sits beside it.
export function GitChangesDiffStack({
  entries,
  diffStyle,
  wrap,
  expandUnchanged,
  folded,
  reveal,
  actionsEnabled,
  onFold,
  onUnfold,
  onOpenFile,
  onStage,
  onUnstage,
  onDiscard,
  diffThemeType,
}: GitChangesDiffStackProps) {
  const setSelectedPath = useSetAtom(gitSelectedPathAtom);
  const consumeReveal = useSetAtom(consumeGitRevealAtom);
  const scrollElementRef = useRef<HTMLDivElement | null>(null);

  // Memoized because the virtualizer's measurement memo keys on their
  // identity: inline closures would rebuild every row's geometry per render.
  const estimateSize = useCallback(
    (index: number) => {
      const entry = entries[index];
      if (!entry) return COLLAPSED_ENTRY_HEIGHT;
      return estimateEntryHeight(entry, {
        collapsed: folded.has(entry.path),
        expandUnchanged,
        diffStyle,
      });
    },
    [entries, folded, expandUnchanged, diffStyle],
  );
  // Fold state, the display options that change a diff's height, and the diff
  // itself are part of the identity: toggling any of them drops the cached
  // measurement, so a row never keeps reserving a height its content no longer
  // has — a stale size would shift the list under the reader as it re-mounts.
  const getItemKey = useCallback(
    (index: number) => {
      const entry = entries[index];
      if (!entry) return index;
      return entryItemKey(entry, {
        folded: folded.has(entry.path),
        diffStyle,
        wrap,
        expandUnchanged,
      });
    },
    [entries, folded, diffStyle, wrap, expandUnchanged],
  );

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: entries.length,
    estimateSize,
    getItemKey,
    getScrollElement: () => scrollElementRef.current,
    overscan: OVERSCAN,
  });
  // TanStack's default size-change anchoring is the right one here: it
  // compensates a first measurement above the fold, and skips the
  // "scrolling up" cascade for re-measurements. Overriding it re-introduced
  // jumps while the reader scrolled backward.

  const correctingIndexRef = useRevealScroll(
    virtualizer,
    scrollElementRef,
    entries,
    reveal,
    onUnfold,
    consumeReveal,
  );
  const { mounted, followReader, scheduleSettle, toggleRow } = useMountWindow({
    virtualizer,
    scrollElementRef,
    entries,
    folded,
    setSelectedPath,
    onFold,
    onUnfold,
    correctingIndexRef,
  });

  const handleScroll = useCallback(() => {
    // Selection follows the pinned file immediately; the expensive mounting
    // waits for the reader to stop.
    followReader();
    scheduleSettle(SCROLL_SETTLE_MS);
  }, [followReader, scheduleSettle]);

  const handleScrollElementRef = useCallback((node: HTMLDivElement | null) => {
    scrollElementRef.current = node;
  }, []);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className="min-h-0 flex-1 overflow-auto px-3 pb-2"
      onScroll={handleScroll}
      ref={handleScrollElementRef}
      style={{ "--diffs-gap-block": `${DIFF_GAP_BLOCK}px` } as CSSProperties}
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((item) => {
          const entry = entries[item.index];
          if (!entry) return null;
          const isFolded = folded.has(entry.path);
          const state = isFolded
            ? "folded"
            : mounted.has(entry.path)
              ? "open"
              : "deferred";
          // Every row carries the body height it will have once open — a
          // deferred row as a placeholder, an open row until pierre paints it —
          // so the stack's geometry is right before the real diff mounts.
          const reservedHeight = Math.max(
            estimateSize(item.index) - CARD_CHROME_HEIGHT,
            0,
          );
          return (
            // Absolute offset rather than a transform: a transformed ancestor
            // becomes the containing block for its sticky descendants and the
            // header would stop pinning to the scrollport.
            <div
              className={cn(
                "absolute inset-x-0 pb-2",
                item.index === 0 && "pt-2",
              )}
              data-index={item.index}
              // The path, not item.key: the virtualizer's key carries fold and
              // display state for cache invalidation, but remounting the card
              // on a fold toggle would drop the chevron's keyboard focus.
              key={entry.path}
              ref={virtualizer.measureElement}
              style={{ top: item.start }}
            >
              <GitChangeFileDiff
                actionsEnabled={actionsEnabled}
                reservedHeight={reservedHeight}
                diffStyle={diffStyle}
                diffThemeType={diffThemeType}
                entry={entry}
                expandUnchanged={expandUnchanged}
                onDiscard={onDiscard}
                onOpenFile={onOpenFile}
                onStage={onStage}
                onToggle={() => toggleRow(entry.path)}
                onUnstage={onUnstage}
                state={state}
                stickyHeader
                wrap={wrap}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
