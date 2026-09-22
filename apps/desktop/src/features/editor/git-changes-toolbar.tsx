import type { TurnChangeSet } from "@cocurdex/shared";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitBranchInfo, GitCommitInfo } from "@/lib";
import { cn } from "@/lib/utils";
import type { GitDiffStyle } from "./git-changes-model";
import {
  GitBranchRefSelectors,
  GitCommitScopeChip,
  GitTurnScopeChip,
} from "./git-changes-ref-selectors";
import { GitChangesScopeMenu } from "./git-changes-scope-menu";
import { GitChangesViewMenu } from "./git-changes-view-menu";
import type { GitDiffScope } from "./git-diff-scope";

interface GitChangesToolbarProps {
  scope: GitDiffScope;
  branches: readonly GitBranchInfo[];
  commits: readonly GitCommitInfo[];
  commitsLoading: boolean;
  sessionId: string | null;
  turnLabels: Record<string, string>;
  turns: readonly TurnChangeSet[];
  turnsLoading: boolean;
  isLoading: boolean;
  diffStyle: GitDiffStyle;
  expandUnchanged: boolean;
  wrap: boolean;
  onDiffStyleChange: (style: GitDiffStyle) => void;
  onExpandUnchangedChange: (expandUnchanged: boolean) => void;
  onWrapChange: (wrap: boolean) => void;
  onScopeChange: (scope: GitDiffScope) => void;
  onOpenCommits: () => void;
  onOpenTurns: () => void;
  onRefresh: () => void;
}

interface ToolbarButtonProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ToolbarButton({
  label,
  icon,
  active = false,
  disabled = false,
  onClick,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <TitlebarIconButton
            active={active}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            {icon}
          </TitlebarIconButton>
        }
      />
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function GitChangesToolbar({
  scope,
  branches,
  commits,
  commitsLoading,
  sessionId,
  turnLabels,
  turns,
  turnsLoading,
  isLoading,
  diffStyle,
  expandUnchanged,
  wrap,
  onDiffStyleChange,
  onExpandUnchangedChange,
  onWrapChange,
  onScopeChange,
  onOpenCommits,
  onOpenTurns,
  onRefresh,
}: GitChangesToolbarProps) {
  return (
    <div
      className="border-b border-editor-border"
      data-testid="git-changes-toolbar"
    >
      <BulkActionsRow
        branches={branches}
        commits={commits}
        commitsLoading={commitsLoading}
        diffStyle={diffStyle}
        expandUnchanged={expandUnchanged}
        sessionId={sessionId}
        turnLabels={turnLabels}
        turns={turns}
        turnsLoading={turnsLoading}
        wrap={wrap}
        disabled={isLoading}
        onDiffStyleChange={onDiffStyleChange}
        onExpandUnchangedChange={onExpandUnchangedChange}
        onOpenCommits={onOpenCommits}
        onOpenTurns={onOpenTurns}
        onRefresh={onRefresh}
        onScopeChange={onScopeChange}
        onWrapChange={onWrapChange}
        scope={scope}
      />
    </div>
  );
}

function BulkActionsRow({
  branches,
  commits,
  commitsLoading,
  disabled,
  diffStyle,
  expandUnchanged,
  wrap,
  onDiffStyleChange,
  onExpandUnchangedChange,
  onOpenCommits,
  onOpenTurns,
  onRefresh,
  onScopeChange,
  onWrapChange,
  scope,
  sessionId,
  turnLabels,
  turns,
  turnsLoading,
}: {
  branches: readonly GitBranchInfo[];
  commits: readonly GitCommitInfo[];
  commitsLoading: boolean;
  disabled: boolean;
  diffStyle: GitDiffStyle;
  expandUnchanged: boolean;
  wrap: boolean;
  onDiffStyleChange: (style: GitDiffStyle) => void;
  onExpandUnchangedChange: (expandUnchanged: boolean) => void;
  onWrapChange: (wrap: boolean) => void;
  onOpenCommits: () => void;
  onOpenTurns: () => void;
  onRefresh: () => void;
  onScopeChange: (scope: GitDiffScope) => void;
  scope: GitDiffScope;
  sessionId: string | null;
  turnLabels: Record<string, string>;
  turns: readonly TurnChangeSet[];
  turnsLoading: boolean;
}) {
  const { t } = useTranslation("editor");
  return (
    <div className="group flex min-h-9 items-center gap-2 ps-3 pe-4 py-1">
      <div className="flex min-w-0 items-center">
        <GitChangesScopeMenu
          commits={commits}
          commitsLoading={commitsLoading}
          disabled={disabled}
          onOpenCommits={onOpenCommits}
          onOpenTurns={onOpenTurns}
          onScopeChange={onScopeChange}
          scope={scope}
          sessionId={sessionId}
          turnLabels={turnLabels}
          turns={turns}
          turnsLoading={turnsLoading}
        />
        {scope.mode === "branch" ? (
          <GitBranchRefSelectors
            disabled={disabled}
            onChange={({ source, target }) =>
              onScopeChange({ mode: "branch", source, target })
            }
            refs={branches}
            source={scope.source}
            target={scope.target}
          />
        ) : null}
        {scope.mode === "commit" ? (
          <GitCommitScopeChip commits={commits} scope={scope} />
        ) : null}
        {scope.mode === "turn" ? (
          <GitTurnScopeChip
            scope={scope}
            turnLabels={turnLabels}
            turns={turns}
          />
        ) : null}
      </div>
      <div className="app-no-drag ms-auto flex items-center gap-1">
        <ToolbarButton
          disabled={disabled}
          icon={
            <RefreshCw
              className={cn(
                TITLEBAR_ICON_GLYPH_CLASS,
                disabled && "animate-spin",
              )}
            />
          }
          label={t("git.refresh")}
          onClick={onRefresh}
        />
        <GitChangesViewMenu
          diffStyle={diffStyle}
          expandUnchanged={expandUnchanged}
          wrap={wrap}
          onDiffStyleChange={onDiffStyleChange}
          onExpandUnchangedChange={onExpandUnchangedChange}
          onWrapChange={onWrapChange}
        />
      </div>
    </div>
  );
}
