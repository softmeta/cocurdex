import type { GitWorktreeInfo } from "@cocurdex/shared";
import { FolderGit2, GitFork } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type AppDropdownTriggerAppearance,
  AppSearchableSelect,
} from "@/components";
import { cn } from "@/lib";
import { workspacePathsEqual } from "./workspace-store";

interface WorktreePickerProps {
  appearance?: AppDropdownTriggerAppearance;
  disabled?: boolean;
  selectedPath: string | null;
  triggerClassName?: string;
  showChevron?: boolean;
  workspaceRootPath: string;
  worktrees: GitWorktreeInfo[];
  onSelect(path: string | null): void;
}

function worktreeLabel(
  worktree: GitWorktreeInfo,
  workspaceRootPath: string,
  mainLabel: string,
) {
  if (workspacePathsEqual(worktree.path, workspaceRootPath)) {
    return mainLabel;
  }
  return (
    worktree.branch ?? worktree.path.split(/[\\/]/).at(-1) ?? worktree.path
  );
}

export function WorktreePicker({
  appearance = "ghost",
  disabled,
  selectedPath,
  triggerClassName,
  showChevron,
  workspaceRootPath,
  worktrees,
  onSelect,
}: WorktreePickerProps) {
  const { t } = useTranslation("sessions");
  const mainLabel = t("worktree.main");
  const visibleWorktrees = useMemo(() => {
    const seen: string[] = [];
    return worktrees.filter((worktree) => {
      if (worktree.bare) {
        return false;
      }
      const already = seen.some((path) =>
        workspacePathsEqual(path, worktree.path),
      );
      if (already) {
        return false;
      }
      seen.push(worktree.path);
      return true;
    });
  }, [worktrees]);
  const selectedWorktree =
    visibleWorktrees.find((worktree) =>
      workspacePathsEqual(worktree.path, selectedPath ?? workspaceRootPath),
    ) ??
    visibleWorktrees.find((worktree) =>
      workspacePathsEqual(worktree.path, workspaceRootPath),
    );
  const selectedValue = selectedWorktree?.path ?? workspaceRootPath;
  const triggerText = selectedWorktree
    ? worktreeLabel(selectedWorktree, workspaceRootPath, mainLabel)
    : mainLabel;

  const options = useMemo(
    () =>
      visibleWorktrees.map((worktree) => {
        const isMain = workspacePathsEqual(worktree.path, workspaceRootPath);
        return {
          value: worktree.path,
          label: worktreeLabel(worktree, workspaceRootPath, mainLabel),
          keywords: `${worktree.branch ?? ""} ${worktree.path}`,
          group: isMain ? "main" : "worktrees",
          groupLabel: isMain ? "" : t("worktree.worktrees"),
          icon: isMain ? (
            <FolderGit2 className="size-3.5" />
          ) : (
            <GitFork className="size-3.5" />
          ),
        };
      }),
    [mainLabel, t, visibleWorktrees, workspaceRootPath],
  );

  if (visibleWorktrees.length < 2) {
    return null;
  }

  return (
    <AppSearchableSelect
      appearance={appearance}
      disabled={disabled}
      emptyText={t("worktree.empty")}
      options={options}
      searchPlaceholder={t("worktree.searchPlaceholder")}
      side="top"
      triggerAriaLabel={t("worktree.label")}
      triggerClassName={cn("max-w-45", triggerClassName)}
      showChevron={showChevron}
      triggerLabel={
        <span className="flex min-w-0 items-center gap-1.5">
          <GitFork className="size-3.5 shrink-0" />
          <span className="truncate">{triggerText}</span>
        </span>
      }
      value={selectedValue}
      onValueChange={(next) => {
        onSelect(workspacePathsEqual(next, workspaceRootPath) ? null : next);
      }}
    />
  );
}
