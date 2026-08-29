import {
  Columns2,
  FileCode,
  FolderTree,
  FoldVertical,
  Funnel,
  List,
  RefreshCw,
  Rows3,
  Undo2,
  UnfoldVertical,
  WrapText,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { AppSelect } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Text } from "@/components/ui/text";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitBranchInfo, GitCommitInfo, GitFileStagedState } from "@/lib";
import { cn } from "@/lib/utils";
import {
  GitChangesCommitPopover,
  type GitCommitAction,
  type GitCommitActionResult,
} from "./git-changes-commit-popover";
import type {
  GitChangeTypeCounts,
  GitChangeTypeFilter,
} from "./git-changes-model";
import {
  GitBranchRefSelectors,
  GitCommitScopeChip,
  GitCurrentBranchChip,
} from "./git-changes-ref-selectors";
import { GitChangesScopeMenu } from "./git-changes-scope-menu";
import type { GitDiffScope } from "./git-diff-scope";
import { isMutableScope } from "./git-diff-scope";
import type { GitViewMode } from "./git-view-mode";

export type GitDiffStyle = "unified" | "split";
// Re-exported from git-view-mode so existing toolbar consumers keep their import.
export type { GitViewMode };

interface GitChangesToolbarProps {
  currentBranch: string | null;
  scope: GitDiffScope;
  branches: readonly GitBranchInfo[];
  commits: readonly GitCommitInfo[];
  commitsLoading: boolean;
  isLoading: boolean;
  fileCount: number;
  // Unfiltered working-tree change count > 0. Used to disable commit/push when clean.
  hasChanges: boolean;
  additions: number;
  deletions: number;
  changeTypeFilter: GitChangeTypeFilter;
  changeTypeCounts: GitChangeTypeCounts;
  stagedState: GitFileStagedState;
  canDiscardAll: boolean;
  diffStyle: GitDiffStyle;
  onDiffStyleChange: (style: GitDiffStyle) => void;
  onChangeTypeFilterChange: (filter: GitChangeTypeFilter) => void;
  onScopeChange: (scope: GitDiffScope) => void;
  onOpenCommits: () => void;
  viewMode: GitViewMode;
  onViewModeChange: (mode: GitViewMode) => void;
  wrap: boolean;
  onWrapChange: (wrap: boolean) => void;
  expandUnchanged: boolean;
  onExpandUnchangedChange: (expandUnchanged: boolean) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onRefresh: () => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onDiscardAll: () => void;
  onCommitAction: (
    action: GitCommitAction,
    options: { message: string; includeUnstaged: boolean },
  ) => Promise<GitCommitActionResult> | GitCommitActionResult;
  onGenerateCommitMessage: (options: {
    includeUnstaged: boolean;
  }) => Promise<string | null>;
}

interface ToolbarButtonProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({
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
  currentBranch,
  scope,
  branches,
  commits,
  commitsLoading,
  isLoading,
  fileCount,
  hasChanges,
  additions,
  deletions,
  changeTypeFilter,
  changeTypeCounts,
  stagedState,
  canDiscardAll,
  diffStyle,
  onDiffStyleChange,
  onChangeTypeFilterChange,
  onScopeChange,
  onOpenCommits,
  viewMode,
  onViewModeChange,
  wrap,
  onWrapChange,
  expandUnchanged,
  onExpandUnchangedChange,
  collapsed,
  onCollapsedChange,
  onRefresh,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  onCommitAction,
  onGenerateCommitMessage,
}: GitChangesToolbarProps) {
  const { t } = useTranslation("editor");
  const mutable = isMutableScope(scope);

  return (
    <TooltipProvider>
      <div
        className="border-b border-editor-border"
        data-testid="git-changes-toolbar"
      >
        <div className="flex items-center gap-1 px-3 py-1">
          {mutable ? (
            <GitCurrentBranchChip currentBranch={currentBranch} />
          ) : null}

          <div className="mx-1 flex items-center gap-2">
            <Text size="meta" tone="muted">
              {t("git.fileCount", { count: fileCount })}
            </Text>
            <Text className="text-editor-git-added" size="meta">
              +{additions}
            </Text>
            <Text className="text-editor-git-deleted" size="meta">
              −{deletions}
            </Text>
          </div>

          <div className="ms-auto flex items-center gap-1">
            <ToolbarButton
              disabled={isLoading}
              icon={
                <RefreshCw
                  className={cn(
                    TITLEBAR_ICON_GLYPH_CLASS,
                    isLoading && "animate-spin",
                  )}
                />
              }
              label={t("git.refresh")}
              onClick={onRefresh}
            />
            {viewMode === "list" ? (
              <ToolbarButton
                icon={
                  collapsed ? (
                    <UnfoldVertical className={TITLEBAR_ICON_GLYPH_CLASS} />
                  ) : (
                    <FoldVertical className={TITLEBAR_ICON_GLYPH_CLASS} />
                  )
                }
                label={collapsed ? t("git.expandAll") : t("git.collapseAll")}
                onClick={() => onCollapsedChange(!collapsed)}
              />
            ) : null}
            <ToolbarButton
              active={diffStyle === "unified"}
              icon={<Rows3 className={TITLEBAR_ICON_GLYPH_CLASS} />}
              label={t("git.unifiedView")}
              onClick={() => onDiffStyleChange("unified")}
            />
            <ToolbarButton
              active={diffStyle === "split"}
              icon={<Columns2 className={TITLEBAR_ICON_GLYPH_CLASS} />}
              label={t("git.splitView")}
              onClick={() => onDiffStyleChange("split")}
            />
            {/* Single toggle: shows the icon/label for the mode it switches to,
                so list and tree never occupy two competing buttons. */}
            <ToolbarButton
              icon={
                viewMode === "list" ? (
                  <FolderTree className={TITLEBAR_ICON_GLYPH_CLASS} />
                ) : (
                  <List className={TITLEBAR_ICON_GLYPH_CLASS} />
                )
              }
              label={
                viewMode === "list" ? t("git.treeView") : t("git.listView")
              }
              onClick={() =>
                onViewModeChange(viewMode === "list" ? "tree" : "list")
              }
            />
            <ToolbarButton
              active={expandUnchanged}
              icon={<FileCode className={TITLEBAR_ICON_GLYPH_CLASS} />}
              label={t("git.toggleFullFile")}
              onClick={() => onExpandUnchangedChange(!expandUnchanged)}
            />
            <ToolbarButton
              active={wrap}
              icon={<WrapText className={TITLEBAR_ICON_GLYPH_CLASS} />}
              label={t("git.toggleWrap")}
              onClick={() => onWrapChange(!wrap)}
            />
          </div>
        </div>
        <BulkActionsRow
          branches={branches}
          canDiscardAll={canDiscardAll}
          changeTypeCounts={changeTypeCounts}
          changeTypeFilter={changeTypeFilter}
          commits={commits}
          commitsLoading={commitsLoading}
          currentBranch={currentBranch}
          disabled={isLoading}
          fileCount={fileCount}
          hasChanges={hasChanges}
          mutable={mutable}
          onChangeTypeFilterChange={onChangeTypeFilterChange}
          onCommitAction={onCommitAction}
          onDiscardAll={onDiscardAll}
          onGenerateCommitMessage={onGenerateCommitMessage}
          onOpenCommits={onOpenCommits}
          onScopeChange={onScopeChange}
          onStageAll={onStageAll}
          onUnstageAll={onUnstageAll}
          scope={scope}
          stagedState={stagedState}
        />
      </div>
    </TooltipProvider>
  );
}

function BulkActionsRow({
  branches,
  canDiscardAll,
  changeTypeFilter,
  changeTypeCounts,
  commits,
  commitsLoading,
  currentBranch,
  disabled,
  fileCount,
  hasChanges,
  mutable,
  onChangeTypeFilterChange,
  onCommitAction,
  onGenerateCommitMessage,
  onOpenCommits,
  onScopeChange,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  scope,
  stagedState,
}: {
  branches: readonly GitBranchInfo[];
  canDiscardAll: boolean;
  changeTypeFilter: GitChangeTypeFilter;
  changeTypeCounts: GitChangeTypeCounts;
  commits: readonly GitCommitInfo[];
  commitsLoading: boolean;
  currentBranch: string | null;
  disabled: boolean;
  fileCount: number;
  hasChanges: boolean;
  mutable: boolean;
  onChangeTypeFilterChange: (filter: GitChangeTypeFilter) => void;
  onCommitAction: (
    action: GitCommitAction,
    options: { message: string; includeUnstaged: boolean },
  ) => Promise<GitCommitActionResult> | GitCommitActionResult;
  onGenerateCommitMessage: (options: {
    includeUnstaged: boolean;
  }) => Promise<string | null>;
  onOpenCommits: () => void;
  onScopeChange: (scope: GitDiffScope) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onDiscardAll: () => void;
  scope: GitDiffScope;
  stagedState: GitFileStagedState;
}) {
  const { t } = useTranslation("editor");
  const [discardOpen, setDiscardOpen] = useState(false);
  // Explicit action, not a "select all" checkbox: when everything is already
  // staged, the affordance flips to unstage; otherwise stage the remainder.
  const fullyStaged = stagedState === "staged";
  const stageAllLabel = fullyStaged ? t("git.unstageAll") : t("git.stageAll");
  const onStageAllAction = fullyStaged ? onUnstageAll : onStageAll;

  return (
    <div className="group flex min-h-9 items-center gap-2 ps-3 pe-4 py-1">
      <GitChangesScopeMenu
        commits={commits}
        commitsLoading={commitsLoading}
        disabled={disabled}
        onOpenCommits={onOpenCommits}
        onScopeChange={onScopeChange}
        scope={scope}
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
      <ChangeTypeFilterSelect
        counts={changeTypeCounts}
        disabled={disabled}
        onValueChange={onChangeTypeFilterChange}
        value={changeTypeFilter}
      />
      {mutable ? (
        <div className="app-no-drag ms-auto flex items-center gap-1">
          {canDiscardAll ? (
            <>
              <Tooltip>
                <TooltipTrigger
                  aria-label={t("git.discardAll")}
                  render={
                    <IconButton
                      aria-label={t("git.discardAll")}
                      className="text-editor-fg-subtle hover:text-editor-fg"
                      disabled={disabled}
                      onClick={() => setDiscardOpen(true)}
                      size="xs"
                    >
                      <Undo2 className="size-3.5" />
                    </IconButton>
                  }
                />
                <TooltipContent side="top" sideOffset={6}>
                  {t("git.discardAll")}
                </TooltipContent>
              </Tooltip>
              <Button
                className="text-editor-fg-subtle hover:text-editor-fg"
                disabled={disabled}
                onClick={onStageAllAction}
                size="xs"
                variant="ghost"
              >
                {stageAllLabel}
              </Button>
            </>
          ) : null}
          <GitChangesCommitPopover
            currentBranch={currentBranch}
            hasChanges={hasChanges}
            onAction={onCommitAction}
            onGenerateMessage={onGenerateCommitMessage}
            parentBusy={disabled}
          />
        </div>
      ) : null}
      <Dialog onOpenChange={setDiscardOpen} open={discardOpen}>
        <DialogContent size="compact">
          <DialogHeader>
            <DialogTitle>{t("git.discardAll")}</DialogTitle>
            <DialogDescription>
              {t("git.discardAllConfirm", { count: fileCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="ghost">{t("git.cancel")}</Button>}
            />
            <Button
              onClick={() => {
                onDiscardAll();
                setDiscardOpen(false);
              }}
              variant="destructive"
            >
              {t("git.discard")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const changeTypeFilterOptions = [
  "all",
  "modified",
  "added",
  "deleted",
] as const satisfies readonly GitChangeTypeFilter[];

export function ChangeTypeFilterSelect({
  counts,
  disabled,
  value,
  onValueChange,
}: {
  counts: GitChangeTypeCounts;
  disabled: boolean;
  value: GitChangeTypeFilter;
  onValueChange: (value: GitChangeTypeFilter) => void;
}) {
  const { t } = useTranslation("editor");

  return (
    <AppSelect
      appearance="ghost"
      contentClassName="min-w-40"
      disabled={disabled}
      options={changeTypeFilterOptions.map((option) => ({
        value: option,
        label: t(`git.changeType.${option}`),
        disabled: option !== "all" && counts[option] === 0,
        trailing: (
          <span className="text-muted-foreground">{counts[option]}</span>
        ),
      }))}
      triggerAriaLabel={t("git.changeTypeFilter")}
      triggerClassName="app-no-drag h-7"
      triggerLabel={
        <>
          <Funnel className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {t(`git.changeType.${value}`)}
          </span>
        </>
      }
      value={value}
      onValueChange={(next) => onValueChange(next as GitChangeTypeFilter)}
    />
  );
}
