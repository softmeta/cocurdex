import { FileDiff as PierreFileDiff } from "@pierre/diffs/react";
import { useTranslation } from "react-i18next";
import type { GitFileStagedState } from "@/lib";
import type { GitChangeEntry } from "./git-changes-model";
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
  collapsed: boolean;
  diffThemeType: "light" | "dark";
  onToggle: () => void;
  onOpenFile: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  // Detail views (the tree's selected pane) always show the diff expanded, so
  // the collapse chevron is hidden there to avoid a dead control.
  hideToggle?: boolean;
  // Hide stage/discard when reviewing a commit or branch compare.
  actionsEnabled?: boolean;
}

// Render a single changed file: a binary placeholder row when there is no
// textual diff, otherwise pierre's expandable file diff with our custom header.
export function GitChangeFileDiff({
  entry,
  diffStyle,
  wrap,
  expandUnchanged,
  collapsed,
  diffThemeType,
  onToggle,
  onOpenFile,
  onStage,
  onUnstage,
  onDiscard,
  hideToggle = false,
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
  // `<diffs-container>` only mounts for an expanded row and renders the code
  // body alone (`disableFileHeader`). This matters on the first expand: pierre
  // synchronously initialises its highlighter (~0.5s) and paints the container
  // empty for a frame, which previously blanked the whole row (the header lived
  // inside that container). Keeping the header outside means the row never
  // disappears — only the code body fills in below once highlighting lands.
  const showDiffBody = !collapsed || hideToggle;
  return (
    <div className="group min-w-full text-body leading-5">
      <GitChangeRowHeader
        actionsEnabled={actionsEnabled}
        additions={entry.additions}
        changeType={entry.changeType}
        collapsed={collapsed}
        deletions={entry.deletions}
        hideToggle={hideToggle}
        onDiscard={onDiscard}
        onOpenFile={onOpenFile}
        onStage={onStage}
        onToggle={onToggle}
        onUnstage={onUnstage}
        path={entry.path}
        stagedState={entry.stagedState}
      />
      {showDiffBody ? (
        <PierreFileDiff
          disableWorkerPool
          fileDiff={diff}
          options={{
            collapsed: false,
            diffStyle,
            // Let us own the header in light DOM (see above); pierre renders
            // only the code body.
            disableFileHeader: true,
            // Full-file mode keeps every unchanged line visible so reviewers
            // get surrounding context without clicking hunk expand controls.
            expandUnchanged,
            // Reveal context in 20-line chunks so larger gaps render separate
            // up/down expand controls (Cursor-style) instead of one button.
            // No effect while expandUnchanged is true.
            expansionLineCount: 20,
            hunkSeparators: "line-info-basic",
            overflow: wrap ? "wrap" : "scroll",
            theme: {
              dark: "pierre-dark",
              light: "pierre-light",
            },
            themeType: diffThemeType,
          }}
          style={{
            display: "block",
            minWidth: "100%",
          }}
        />
      ) : null}
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
