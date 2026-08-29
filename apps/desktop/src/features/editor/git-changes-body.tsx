import { FileDiff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkspaceGitDiffStatus } from "@/lib";
import { GitChangesList } from "./git-changes-list";
import type { GitChangeEntry } from "./git-changes-model";
import type { GitDiffStyle } from "./git-changes-toolbar";
import { GitChangesTree } from "./git-changes-tree";
import type { GitDiffScope } from "./git-diff-scope";
import type { GitViewMode } from "./git-view-mode";

interface GitChangesBodyProps {
  isLoading: boolean;
  isFiltered: boolean;
  diffStatus: WorkspaceGitDiffStatus;
  entries: GitChangeEntry[];
  workspaceName: string;
  diffStyle: GitDiffStyle;
  viewMode: GitViewMode;
  wrap: boolean;
  expandUnchanged: boolean;
  folded: ReadonlySet<string>;
  actionsEnabled: boolean;
  scopeMode: GitDiffScope["mode"];
  onToggleFile: (key: string) => void;
  onOpenFile: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  diffThemeType: "light" | "dark";
}

// Pick the empty-state copy for the panel: git failures and non-repo folders
// must read differently from a genuinely clean working tree.
function resolveEmptyStateCopy(
  t: ReturnType<typeof useTranslation<"editor">>["t"],
  diffStatus: WorkspaceGitDiffStatus,
  isFiltered: boolean,
  scopeMode: GitDiffScope["mode"],
): { title: string; description: string } {
  if (diffStatus === "not-a-repo") {
    return {
      title: t("states.gitNotRepoTitle"),
      description: t("states.gitNotRepoDescription"),
    };
  }
  if (diffStatus === "error") {
    return {
      title: t("states.gitErrorTitle"),
      description: t("states.gitErrorDescription"),
    };
  }
  if (isFiltered) {
    return {
      title: t("states.gitFilterEmptyTitle"),
      description: t("states.gitFilterEmptyDescription"),
    };
  }
  if (scopeMode === "unstaged") {
    return {
      title: t("states.gitEmptyUnstagedTitle"),
      description: t("states.gitEmptyUnstagedDescription"),
    };
  }
  if (scopeMode === "staged") {
    return {
      title: t("states.gitEmptyStagedTitle"),
      description: t("states.gitEmptyStagedDescription"),
    };
  }
  if (scopeMode === "commit") {
    return {
      title: t("states.gitEmptyCommitTitle"),
      description: t("states.gitEmptyCommitDescription"),
    };
  }
  if (scopeMode === "branch") {
    return {
      title: t("states.gitEmptyBranchTitle"),
      description: t("states.gitEmptyBranchDescription"),
    };
  }
  return {
    title: t("states.gitEmptyTitle"),
    description: t("states.gitEmptyDescription"),
  };
}

// Dispatch between the loading / empty placeholders and the two change views
// (stacked list vs. master-detail tree).
export function GitChangesBody({
  isLoading,
  isFiltered,
  diffStatus,
  entries,
  workspaceName,
  diffStyle,
  viewMode,
  wrap,
  expandUnchanged,
  folded,
  actionsEnabled,
  scopeMode,
  onToggleFile,
  onOpenFile,
  onStage,
  onUnstage,
  onDiscard,
  diffThemeType,
}: GitChangesBodyProps) {
  const { t } = useTranslation("editor");

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-xs text-editor-fg-muted">
          {t("states.loadingGitChanges")}
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    const { title, description } = resolveEmptyStateCopy(
      t,
      diffStatus,
      isFiltered,
      scopeMode,
    );
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <div className="space-y-3">
          <FileDiff className="mx-auto size-5 text-editor-fg-muted" />
          <div className="space-y-2">
            <p className="text-sm text-editor-fg">{title}</p>
            <p className="text-xs leading-5 text-editor-fg-muted">
              {description}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "tree") {
    return (
      <GitChangesTree
        actionsEnabled={actionsEnabled}
        diffStyle={diffStyle}
        diffThemeType={diffThemeType}
        entries={entries}
        expandUnchanged={expandUnchanged}
        onDiscard={onDiscard}
        onOpenFile={onOpenFile}
        onStage={onStage}
        onUnstage={onUnstage}
        workspaceName={workspaceName}
        wrap={wrap}
      />
    );
  }

  return (
    <GitChangesList
      actionsEnabled={actionsEnabled}
      diffStyle={diffStyle}
      diffThemeType={diffThemeType}
      entries={entries}
      expandUnchanged={expandUnchanged}
      folded={folded}
      onDiscard={onDiscard}
      onOpenFile={onOpenFile}
      onStage={onStage}
      onToggleFile={onToggleFile}
      onUnstage={onUnstage}
      wrap={wrap}
    />
  );
}
