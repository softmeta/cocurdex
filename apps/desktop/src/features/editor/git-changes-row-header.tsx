import {
  ChevronDown,
  ChevronRight,
  FileMinus,
  FilePen,
  FilePlus,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/text";
import type { GitChangeKind, GitFileStagedState } from "@/lib";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { GitChangeRowActions } from "./git-changes-row-actions";

interface GitChangeRowHeaderProps {
  path: string;
  changeType: GitChangeKind;
  additions: number;
  deletions: number;
  collapsed: boolean;
  onToggle: () => void;
  onOpenFile: (path: string) => void;
  // Hide the collapse chevron when the diff is rendered always-expanded (e.g.
  // the tree view's selected-file detail pane).
  hideToggle?: boolean;
  stagedState: GitFileStagedState;
  actionsEnabled?: boolean;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
}

// Per-change-type glyph + tint, mirroring git's status vocabulary so a row's
// kind reads at a glance without expanding the diff.
const CHANGE_ICONS: Record<
  GitChangeKind,
  { icon: LucideIcon; className: string }
> = {
  added: { icon: FilePlus, className: "text-editor-git-added" },
  deleted: { icon: FileMinus, className: "text-editor-git-deleted" },
  modified: { icon: FilePen, className: "text-editor-git-modified" },
};

// Custom file-diff header: pierre renders its own header (icon + name + a
// far-right +/- summary) inside a shadow root we cannot restyle, so we replace
// it wholesale to place the per-file change counts directly after the filename.
export function GitChangeRowHeader({
  path,
  changeType,
  additions,
  deletions,
  collapsed,
  onToggle,
  onOpenFile,
  hideToggle = false,
  stagedState,
  actionsEnabled = true,
  onStage,
  onUnstage,
  onDiscard,
}: GitChangeRowHeaderProps) {
  const { t } = useTranslation("editor");
  const { icon: ChangeIcon, className: iconClassName } =
    CHANGE_ICONS[changeType];
  // Split so the directory can truncate while the filename stays visible.
  const lastSlash = path.lastIndexOf("/");
  const dir = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : "";
  const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;

  return (
    <div className="app-no-drag flex w-full min-w-0 items-center gap-2 rounded-control px-1 py-0.5 transition-colors hover:bg-editor-tab-hover-bg">
      {hideToggle ? null : (
        <button
          aria-expanded={!collapsed}
          className="flex size-4 shrink-0 items-center justify-center rounded-control text-editor-fg-subtle transition-colors hover:text-editor-fg"
          onClick={onToggle}
          type="button"
        >
          {collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      )}
      <button
        className="group/file flex min-w-0 items-center gap-2 text-start"
        onClick={() => onOpenFile(path)}
        type="button"
      >
        <ChangeIcon className={cn("size-3.5 shrink-0", iconClassName)} />
        <span className="flex min-w-0 items-center underline-offset-2 decoration-editor-fg-subtle/40 group-hover/file:underline">
          {dir ? (
            <span className="truncate text-editor-fg-muted">{dir}</span>
          ) : null}
          <span className="shrink-0 text-editor-fg">{name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {deletions > 0 ? (
            <Text className="text-editor-git-deleted" size="meta">
              −{deletions}
            </Text>
          ) : null}
          {additions > 0 ? (
            <Text className="text-editor-git-added" size="meta">
              +{additions}
            </Text>
          ) : null}
        </span>
      </button>
      <CopyButton label={t("git.copyPath")} value={path} />
      {actionsEnabled ? (
        <div className="ms-auto shrink-0">
          <GitChangeRowActions
            onDiscard={onDiscard}
            onStage={onStage}
            onUnstage={onUnstage}
            path={path}
            stagedState={stagedState}
          />
        </div>
      ) : null}
    </div>
  );
}
