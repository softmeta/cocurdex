import {
  type FileDiffMetadata,
  getHighlighterIfLoaded,
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
  type GitDiffStyle,
} from "./git-changes-model";
import { GitChangeRowActions } from "./git-changes-row-actions";
import { GitChangeRowHeader } from "./git-changes-row-header";

interface GitChangeFileDiffProps {
  entry: GitChangeEntry;
  diffStyle: GitDiffStyle;
  wrap: boolean;
  expandUnchanged: boolean;
  state: GitChangeRowState;
  reservedHeight?: number;
  diffThemeType: "light" | "dark";
  onToggle: () => void;
  onOpenFile: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  stickyHeader?: boolean;
  actionsEnabled?: boolean;
}

export type GitChangeRowState = "open" | "folded" | "deferred";

type PierreDiffOptions = ComponentProps<typeof PierreFileDiff>["options"];

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

function useDiffHighlighterReady(language: SupportedLanguages): boolean {
  const [ready, setReady] = useState(
    () =>
      getHighlighterIfLoaded({ theme: GIT_DIFF_THEMES, lang: language }) !==
      undefined,
  );

  useEffect(() => {
    if (ready) return;
    let active = true;
    preloadHighlighter({
      themes: GIT_DIFF_THEME_NAMES,
      langs: [language],
      preferredHighlighter: "highlights",
    }).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [language, ready]);

  return ready;
}

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

  const diffOptions: PierreDiffOptions = {
    collapsed: false,
    diffStyle,
    disableFileHeader: true,
    expandUnchanged,
    expansionLineCount: 20,
    hunkSeparators: "line-info-basic",
    overflow: wrap ? "wrap" : "scroll",
    preferredHighlighter: "highlights",
    theme: GIT_DIFF_THEMES,
    themeType: diffThemeType,
  };

  return (
    <div className="overflow-clip rounded-card border border-editor-border">
      <div className="group min-w-full text-body leading-5">
        <div
          className={cn(
            "rounded-t-card pt-2 transition-colors hover:bg-editor-tab-hover-bg",
            state === "folded" && "rounded-b-card pb-2",
            stickyHeader && "sticky top-0 z-10 bg-editor-monaco-bg",
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
