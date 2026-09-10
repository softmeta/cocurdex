import { useAtomValue } from "jotai";
import type { CSSProperties } from "react";
import { useScrollIntoViewWhenActive } from "@/lib";
import { GitChangeFileDiff } from "./git-changes-file-diff";
import type { GitChangeEntry } from "./git-changes-model";
import { gitRevealClockAtom, gitSelectedPathAtom } from "./git-changes-store";
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

interface GitChangeListRowProps {
  entry: GitChangeEntry;
  selected: boolean;
  collapsed: boolean;
  diffStyle: GitDiffStyle;
  wrap: boolean;
  expandUnchanged: boolean;
  actionsEnabled: boolean;
  onToggleFile: (key: string) => void;
  onOpenFile: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  diffThemeType: "light" | "dark";
  revealClock: number;
}

function GitChangeListRow({
  entry,
  selected,
  diffStyle,
  wrap,
  expandUnchanged,
  collapsed,
  actionsEnabled,
  onToggleFile,
  onOpenFile,
  onStage,
  onUnstage,
  onDiscard,
  diffThemeType,
  revealClock,
}: GitChangeListRowProps) {
  const scrollRef = useScrollIntoViewWhenActive<HTMLDivElement>(
    selected ? revealClock + 1 : 0,
  );

  return (
    <div ref={scrollRef}>
      <GitChangeFileDiff
        actionsEnabled={actionsEnabled}
        collapsed={collapsed}
        diffStyle={diffStyle}
        diffThemeType={diffThemeType}
        entry={entry}
        expandUnchanged={expandUnchanged}
        onDiscard={onDiscard}
        onOpenFile={onOpenFile}
        onStage={onStage}
        onToggle={() => onToggleFile(entry.path)}
        onUnstage={onUnstage}
        wrap={wrap}
      />
    </div>
  );
}

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
  const selectedPath = useAtomValue(gitSelectedPathAtom);
  const revealClock = useAtomValue(gitRevealClockAtom);

  return (
    <div
      className="min-h-0 flex-1 space-y-1 overflow-auto px-3 py-2"
      style={{ "--diffs-gap-block": "2px" } as CSSProperties}
    >
      {entries.map((entry) => (
        <GitChangeListRow
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
          onToggleFile={onToggleFile}
          onUnstage={onUnstage}
          revealClock={revealClock}
          selected={entry.path === selectedPath}
          wrap={wrap}
        />
      ))}
    </div>
  );
}
