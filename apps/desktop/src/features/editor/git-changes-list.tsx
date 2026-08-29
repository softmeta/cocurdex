import type { CSSProperties } from "react";
import { GitChangeFileDiff } from "./git-changes-file-diff";
import type { GitChangeEntry } from "./git-changes-model";
import type { GitDiffStyle } from "./git-changes-toolbar";

interface GitChangesListProps {
  entries: GitChangeEntry[];
  diffStyle: GitDiffStyle;
  wrap: boolean;
  expandUnchanged: boolean;
  folded: ReadonlySet<string>;
  actionsEnabled: boolean;
  onToggleFile: (key: string) => void;
  onOpenFile: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  diffThemeType: "light" | "dark";
}

// Stacked list of every changed file's diff, each collapsible by its header
// chevron. This is the default view; the tree view is the alternative.
export function GitChangesList({
  entries,
  diffStyle,
  wrap,
  expandUnchanged,
  folded,
  actionsEnabled,
  onToggleFile,
  onOpenFile,
  onStage,
  onUnstage,
  onDiscard,
  diffThemeType,
}: GitChangesListProps) {
  // Keep rows on a consistent rhythm in both states. Pierre sizes its header as
  // `1lh + gap-block * 3`; the 8px default leaves collapsed rows looking floaty
  // and out of step with each other, so shrink the block gap for every row (it
  // barely affects expanded code line spacing). Match the toolbar's horizontal
  // inset so file rows do not press against the panel edges.
  return (
    <div
      className="min-h-0 flex-1 space-y-1 overflow-auto px-3 py-2"
      style={{ "--diffs-gap-block": "2px" } as CSSProperties}
    >
      {entries.map((entry) => (
        <GitChangeFileDiff
          actionsEnabled={actionsEnabled}
          collapsed={folded.has(entry.path)}
          diffStyle={diffStyle}
          diffThemeType={diffThemeType}
          entry={entry}
          expandUnchanged={expandUnchanged}
          key={entry.path}
          onDiscard={onDiscard}
          onOpenFile={onOpenFile}
          onStage={onStage}
          onToggle={() => onToggleFile(entry.path)}
          onUnstage={onUnstage}
          wrap={wrap}
        />
      ))}
    </div>
  );
}
