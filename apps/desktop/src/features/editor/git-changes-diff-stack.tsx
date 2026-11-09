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
import { useMountEffect } from "@/lib";
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

const ROW_GAP_PX = 8;
const PINNED_ROW_TOLERANCE_PX = ROW_GAP_PX + 1;

const REVEAL_CORRECTION_INTERVAL_MS = 50;
const REVEAL_CORRECTION_ATTEMPTS = 8;

const OVERSCAN = 2;

const SCROLL_SETTLE_MS = 140;

export interface GitChangesDiffStackProps {
  entries: GitChangeEntry[];
  diffStyle: GitDiffStyle;
  wrap: boolean;
  expandUnchanged: boolean;
  folded: ReadonlySet<string>;
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
    if (item.start >= top && item.end <= bottom) return;
    if (item.start < top && item.end > bottom) return;
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

  useMountEffect(() => () => {
    if (correctionTimerRef.current !== null) {
      clearTimeout(correctionTimerRef.current);
    }
  });

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
  correctingIndexRef: RefObject<number | null>;
}

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
  "use no memo";
  const [mounted, setMounted] = useState<ReadonlySet<string>>(new Set());
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: the mounted band is read from the virtualizer at run time; this render's items are the trigger for re-checking it
  useEffect(() => {
    if (virtualizer.isScrolling) return;
    mountBand();
  }, [virtualItems, entries, mountBand, virtualizer]);

  useMountEffect(() => () => {
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
  });

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
          const reservedHeight = Math.max(
            estimateSize(item.index) - CARD_CHROME_HEIGHT,
            0,
          );
          return (
            <div
              className={cn(
                "absolute inset-x-0 pb-2",
                item.index === 0 && "pt-2",
              )}
              data-index={item.index}
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
