import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { desktopApi } from "@/lib";
import type {
  GitCommitAction,
  GitCommitActionResult,
} from "./git-changes-commit-popover";

interface UseGitCommitActionsOptions {
  rootPath: string | null;
  loadBranches(path: string): Promise<void>;
  loadCommits(path: string): Promise<void>;
  loadDiff(path: string, options?: { showLoading?: boolean }): Promise<void>;
}

export function useGitCommitActions({
  rootPath,
  loadBranches,
  loadCommits,
  loadDiff,
}: UseGitCommitActionsOptions) {
  const { t } = useTranslation("editor");
  const [isCommitActionPending, setIsCommitActionPending] = useState(false);

  const handleGenerateCommitMessage = useCallback(
    async (options: { includeUnstaged: boolean }): Promise<string | null> => {
      if (!rootPath) {
        return null;
      }
      try {
        return await desktopApi.generateGitCommitMessage(rootPath, options);
      } catch (error) {
        const detail =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : null;
        toast.error(detail ?? t("git.generateCommitMessageFailed"));
        return null;
      }
    },
    [rootPath, t],
  );

  const handleCommitAction = useCallback(
    async (
      action: GitCommitAction,
      options: { message: string; includeUnstaged: boolean },
    ): Promise<GitCommitActionResult> => {
      if (!rootPath) {
        return { committed: false, completed: false };
      }
      setIsCommitActionPending(true);
      let didCommit = false;
      try {
        if (action === "commit" || action === "commitAndPush") {
          await desktopApi.commitGitChanges(rootPath, options);
          didCommit = true;
        }
        if (action === "push" || action === "commitAndPush") {
          await desktopApi.pushGitBranch(rootPath);
        }
        if (action === "commit") {
          toast.success(t("git.commitSuccess"));
        } else if (action === "commitAndPush") {
          toast.success(t("git.commitAndPushSuccess"));
        } else {
          toast.success(t("git.pushSuccess"));
        }
        return { committed: didCommit, completed: true };
      } catch (error) {
        const detail =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : null;
        const failedOnPush =
          action === "push" || (action === "commitAndPush" && didCommit);
        toast.error(
          detail ??
            (failedOnPush ? t("git.pushFailed") : t("git.commitFailed")),
        );
        if (didCommit) {
          return { committed: true, completed: false };
        }
        throw error;
      } finally {
        if (didCommit) {
          await loadDiff(rootPath, { showLoading: false });
          void loadCommits(rootPath);
        }
        void loadBranches(rootPath);
        setIsCommitActionPending(false);
      }
    },
    [rootPath, loadDiff, loadCommits, loadBranches, t],
  );

  return {
    handleCommitAction,
    handleGenerateCommitMessage,
    isCommitActionPending,
  };
}
