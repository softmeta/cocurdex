import { FileDiff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitFileStagedState, WorkspaceGitDiffStatus } from "@/lib";
import type {
  GitCommitAction,
  GitCommitActionResult,
} from "./git-changes-commit-popover";
import type { GitChangesDiffStackProps } from "./git-changes-diff-stack";
import { GitChangesTree } from "./git-changes-tree";
import type { GitDiffScope } from "./git-diff-scope";

interface GitChangesBodyProps extends GitChangesDiffStackProps {
  isLoading: boolean;
  actionsBusy: boolean;
  diffStatus: WorkspaceGitDiffStatus;
  workspaceName: string;
  treePanelVisible: boolean;
  scopeMode: GitDiffScope["mode"];
  stagedState: GitFileStagedState;
  currentBranch: string | null;
  hasChanges: boolean;
  onDiscardAll: () => void;
  onCommitAction: (
    action: GitCommitAction,
    options: { message: string; includeUnstaged: boolean },
  ) => Promise<GitCommitActionResult> | GitCommitActionResult;
  onGenerateCommitMessage: (options: {
    includeUnstaged: boolean;
  }) => Promise<string | null>;
  onTreePanelVisibleChange: (visible: boolean) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  turnEmptyReason?: "none" | "expired" | "missing" | null;
}

// Pick the empty-state copy for the panel: git failures and non-repo folders
// must read differently from a genuinely clean working tree.
function resolveEmptyStateCopy(
  t: ReturnType<typeof useTranslation<"editor">>["t"],
  diffStatus: WorkspaceGitDiffStatus,
  scopeMode: GitDiffScope["mode"],
  turnEmptyReason?: "none" | "expired" | "missing" | null,
): { title: string; description: string } {
  if (diffStatus === "not-a-repo" && scopeMode !== "turn") {
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
  if (scopeMode === "turn") {
    if (turnEmptyReason === "expired") {
      return {
        title: t("states.gitEmptyTurnExpiredTitle"),
        description: t("states.gitEmptyTurnExpiredDescription"),
      };
    }
    if (turnEmptyReason === "none") {
      return {
        title: t("states.gitEmptyTurnNoneTitle"),
        description: t("states.gitEmptyTurnNoneDescription"),
      };
    }
    return {
      title: t("states.gitEmptyTurnTitle"),
      description: t("states.gitEmptyTurnDescription"),
    };
  }
  return {
    title: t("states.gitEmptyTitle"),
    description: t("states.gitEmptyDescription"),
  };
}

// Dispatch between the loading / empty placeholders and the change view: the
// diffs always stack the same way, with the file index optionally beside them.
export function GitChangesBody({
  isLoading,
  actionsBusy,
  diffStatus,
  entries,
  workspaceName,
  treePanelVisible,
  scopeMode,
  stagedState,
  currentBranch,
  hasChanges,
  onDiscardAll,
  onCommitAction,
  onGenerateCommitMessage,
  onTreePanelVisibleChange,
  onStageAll,
  onUnstageAll,
  turnEmptyReason = null,
  ...stackProps
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
      scopeMode,
      turnEmptyReason,
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

  return (
    <GitChangesTree
      actionsBusy={actionsBusy}
      entries={entries}
      showTreePanel={treePanelVisible}
      stagedState={stagedState}
      workspaceName={workspaceName}
      currentBranch={currentBranch}
      hasChanges={hasChanges}
      onCommitAction={onCommitAction}
      onDiscardAll={onDiscardAll}
      onGenerateCommitMessage={onGenerateCommitMessage}
      onStageAll={onStageAll}
      onTreePanelVisibleChange={onTreePanelVisibleChange}
      onUnstageAll={onUnstageAll}
      {...stackProps}
    />
  );
}
