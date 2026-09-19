import {
  areLanguagesAttached,
  areThemesAttached,
  type FileDiffMetadata,
  preloadHighlighter,
  type SupportedLanguages,
} from "@pierre/diffs";
import { FileDiff as PierreFileDiff } from "@pierre/diffs/react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GitFileStagedState } from "@/lib";
import { cn } from "@/lib/utils";
import {
  entryLanguage,
  GIT_DIFF_THEME_NAMES,
  GIT_DIFF_THEMES,
  type GitChangeEntry,
} from "./git-changes-model";
import { GitChangeRowActions } from "./git-changes-row-actions";
import { GitChangeRowHeader } from "./git-changes-row-header";
import type { GitDiffStyle } from "./git-changes-toolbar";

interface GitChangeFileDiffProps {
  entry: GitChangeEntry;
  diffStyle: GitDiffStyle;
  wrap: boolean;
  // When true, pierre renders the entire file (unchanged lines included)
  // instead of collapsible hunk gaps.
  expandUnchanged: boolean;
  // Open rows carry a pierre diff; folded rows are shut by the reader; deferred
  // rows hold their estimated height until they reach the viewport.
  state: GitChangeRowState;
  // Height this row's diff body occupies when open, estimated ahead of pierre
  // rendering it. A deferred row renders it as a placeholder, and an open row
  // holds it until pierre reports its first paint, so stack positions never
  // drift before the real diff takes over.
  reservedHeight?: number;
  diffThemeType: "light" | "dark";
  onToggle: () => void;
  onOpenFile: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  // Pin the header to the top of the scrolling pane so the file name stays
  // visible while reading a long diff. Each row is its own card, so a pinned
  // header is pushed out by the card below it.
  stickyHeader?: boolean;
  // Hide stage/discard when reviewing a commit or branch compare.
  actionsEnabled?: boolean;
}

export type GitChangeRowState = "open" | "folded" | "deferred";

type PierreDiffOptions = ComponentProps<typeof PierreFileDiff>["options"];

// Deferred and not-yet-painted rows reserve the height of the diff that belongs
// there. A few muted bars say "content lands here" instead of leaving the reader
// with a blank band scrolling past.
const DEFERRED_BAR_WIDTHS = ["w-3/4", "w-1/2", "w-2/3"] as const;
const DEFERRED_BAR_SPACING = 56;

function DeferredDiffBody({ height }: { height: number }) {
  const bars = Math.min(
    DEFERRED_BAR_WIDTHS.length,
    Math.floor(height / DEFERRED_BAR_SPACING),
  );
  return (
    <div aria-hidden className="space-y-1.5 px-1 py-1" style={{ height }}>
      {DEFERRED_BAR_WIDTHS.slice(0, bars).map((width) => (
        <div
          className={cn("h-4 rounded-control bg-editor-tab-hover-bg", width)}
          key={width}
        />
      ))}
    </div>
  );
}

// Pierre paints a diff synchronously only once its highlighter holds the diff's
// language and themes; a body rendered before that stays empty forever, because
// the later async highlight result never repaints it. Loading what a row needs
// before mounting it is what turns the placeholder into a diff.
function useDiffHighlighterReady(language: SupportedLanguages): boolean {
  const [ready, setReady] = useState(
    () => areLanguagesAttached(language) && areThemesAttached(GIT_DIFF_THEMES),
  );

  useEffect(() => {
    if (ready) return;
    let active = true;
    preloadHighlighter({
      themes: GIT_DIFF_THEME_NAMES,
      langs: [language],
    }).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [language, ready]);

  return ready;
}

// Pierre gives an unpainted body no height at all. A row that shrank to its
// header would pull every file below it up the stack — the reader sees a
// mid-list file open and the files above it "collapsed". The reserved height
// therefore holds until the body itself reports a height; the real diff then
// takes over at the size it was reserved for.
function PendingDiffBody({
  diff,
  language,
  options,
  reservedHeight,
}: {
  diff: FileDiffMetadata;
  language: SupportedLanguages;
  options: PierreDiffOptions;
  reservedHeight: number;
}) {
  const highlighterReady = useDiffHighlighterReady(language);
  const [bodyHeight, setBodyHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const measureBody = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (node === null) return;
    const observer = new ResizeObserver(() => setBodyHeight(node.offsetHeight));
    observer.observe(node);
    observerRef.current = observer;
  }, []);
  const painted = bodyHeight > 0;

  return (
    <div
      className="relative"
      style={painted ? undefined : { minHeight: reservedHeight }}
    >
      <div ref={measureBody}>
        {highlighterReady ? (
          <PierreFileDiff
            disableWorkerPool
            fileDiff={diff}
            options={options}
            style={{
              display: "block",
              minWidth: "100%",
            }}
          />
        ) : null}
      </div>
      {painted ? null : (
        <div className="pointer-events-none absolute inset-x-0 top-0">
          <DeferredDiffBody height={reservedHeight} />
        </div>
      )}
    </div>
  );
}

// Render a single changed file: a binary placeholder row when there is no
// textual diff, otherwise pierre's expandable file diff with our custom header.
export function GitChangeFileDiff({
  entry,
  diffStyle,
  wrap,
  expandUnchanged,
  state,
  reservedHeight,
  diffThemeType,
  onToggle,
  onOpenFile,
  onStage,
  onUnstage,
  onDiscard,
  stickyHeader = false,
  actionsEnabled = true,
}: GitChangeFileDiffProps) {
  if (entry.diff == null) {
    return (
      <OmittedFileRow
        actionsEnabled={actionsEnabled}
        onDiscard={onDiscard}
        onOpenFile={onOpenFile}
        onStage={onStage}
        onUnstage={onUnstage}
        path={entry.path}
        reason={entry.omittedReason ?? "unsupported"}
        stagedState={entry.stagedState}
      />
    );
  }

  const { diff } = entry;

  // The header is always rendered by us in light DOM (never via pierre's
  // `renderCustomHeader`), so it stays mounted across collapse/expand. Pierre's
  // `<diffs-container>` only mounts for an open row and renders the code body
  // alone (`disableFileHeader`), so the header never disappears while the body
  // fills in below it.
  const diffOptions: PierreDiffOptions = {
    collapsed: false,
    diffStyle,
    // Let us own the header in light DOM (see above); pierre renders only the
    // code body.
    disableFileHeader: true,
    // Full-file mode keeps every unchanged line visible so reviewers get
    // surrounding context without clicking hunk expand controls.
    expandUnchanged,
    // Reveal context in 20-line chunks so larger gaps render separate up/down
    // expand controls (Cursor-style) instead of one button. No effect while
    // expandUnchanged is true.
    expansionLineCount: 20,
    hunkSeparators: "line-info-basic",
    overflow: wrap ? "wrap" : "scroll",
    theme: GIT_DIFF_THEMES,
    themeType: diffThemeType,
  };

  return (
    // One changed file is one card; the stack spaces consecutive cards apart.
    <div className="rounded-card border border-editor-border">
      <div className="group min-w-full text-body leading-5">
        {/* Sticky lives on a wrapper, not the header row: the row's rounded
            corners would otherwise let the scrolled diff show through behind
            it. The band carries the card's top spacing — padding on an ancestor
            of the sticky box would leave a transparent strip above it. */}
        <div
          className={cn(
            "pt-2",
            stickyHeader &&
              "sticky top-0 z-10 rounded-t-card bg-editor-monaco-bg",
          )}
        >
          <GitChangeRowHeader
            actionsEnabled={actionsEnabled}
            additions={entry.additions}
            changeType={entry.changeType}
            collapsed={state !== "open"}
            deletions={entry.deletions}
            onDiscard={onDiscard}
            onOpenFile={onOpenFile}
            onStage={onStage}
            onToggle={onToggle}
            onUnstage={onUnstage}
            path={entry.path}
            stagedState={entry.stagedState}
          />
        </div>
        {state === "folded" ? null : state === "deferred" ? (
          <DeferredDiffBody height={reservedHeight ?? 0} />
        ) : (
          <PendingDiffBody
            diff={diff}
            language={entryLanguage(entry)}
            options={diffOptions}
            reservedHeight={reservedHeight ?? 0}
          />
        )}
      </div>
    </div>
  );
}

// Placeholder row for a change without a renderable diff: git flagged it
// binary, it exceeds the size cap, or the diff parser rejected it.
function OmittedFileRow({
  path,
  reason,
  stagedState,
  actionsEnabled,
  onStage,
  onUnstage,
  onDiscard,
  onOpenFile,
}: {
  path: string;
  reason: NonNullable<GitChangeEntry["omittedReason"]>;
  stagedState: GitFileStagedState;
  actionsEnabled: boolean;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const { t } = useTranslation("editor");
  const reasonLabels = {
    binary: t("git.binaryFile"),
    "too-large": t("git.fileTooLarge"),
    unavailable: t("git.checkpointUnavailable"),
    unsupported: t("git.diffUnavailable"),
  } as const;
  return (
    <div className="group flex items-center gap-2 rounded-card border border-editor-border px-3 py-2">
      <button
        className="min-w-0 flex-1 text-start"
        onClick={() => onOpenFile(path)}
        type="button"
      >
        <p className="truncate text-xs text-editor-fg">{path}</p>
        <p className="text-2xs text-editor-fg-muted">{reasonLabels[reason]}</p>
      </button>
      {actionsEnabled ? (
        <GitChangeRowActions
          onDiscard={onDiscard}
          onStage={onStage}
          onUnstage={onUnstage}
          path={path}
          stagedState={stagedState}
        />
      ) : null}
    </div>
  );
}
