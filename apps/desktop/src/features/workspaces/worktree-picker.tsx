import type { GitWorktreeInfo } from "@cocurdex/shared";
import { FolderGit2, GitFork, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  type AppDropdownTriggerAppearance,
  AppSearchableSelect,
} from "@/components";
import { cn, desktopApi, type GitBranchInfo } from "@/lib";
import { CreateWorktreeDialog } from "./create-worktree-dialog";
import { workspacePathsEqual } from "./workspace-store";

const CREATE_WORKTREE_VALUE = "__create_worktree__";

interface WorktreePickerProps {
  appearance?: AppDropdownTriggerAppearance;
  branches?: GitBranchInfo[];
  currentBranch?: string | null;
  selectedPath: string | null;
  triggerClassName?: string;
  workspaceId: string;
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
  branches = [],
  currentBranch,
  selectedPath,
  triggerClassName,
  workspaceId,
  workspaceRootPath,
  worktrees,
  onSelect,
}: WorktreePickerProps) {
  const { t } = useTranslation("sessions");
  const [createOpen, setCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdWorktrees, setCreatedWorktrees] = useState<GitWorktreeInfo[]>(
    [],
  );
  const mainLabel = t("worktree.main");
  const visibleWorktrees = useMemo(() => {
    const merged = [...worktrees, ...createdWorktrees];
    const seen: string[] = [];
    return merged.filter((worktree) => {
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
  }, [createdWorktrees, worktrees]);
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
    () => [
      ...visibleWorktrees.map((worktree) => {
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
      {
        value: CREATE_WORKTREE_VALUE,
        label: t("worktree.create"),
        group: "actions",
        groupLabel: "",
        icon: <Plus className="size-3.5" />,
      },
    ],
    [mainLabel, t, visibleWorktrees, workspaceRootPath],
  );

  const handleCreate = async (payload: {
    branch: string;
    startPoint?: string;
  }) => {
    setIsCreating(true);
    try {
      const created = await desktopApi.addGitWorktree({
        repoRootPath: workspaceRootPath,
        workspaceId,
        branch: payload.branch,
        startPoint: payload.startPoint,
      });
      setCreatedWorktrees((current) => [...current, created]);
      onSelect(created.path);
      setCreateOpen(false);
    } catch (error) {
      toast.error(
        t("worktree.createFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setIsCreating(false);
    }
  };

  if (visibleWorktrees.length === 0) {
    return null;
  }

  return (
    <>
      <AppSearchableSelect
        appearance={appearance}
        disabled={isCreating}
        emptyText={t("worktree.empty")}
        options={options}
        searchPlaceholder={t("worktree.searchPlaceholder")}
        side="top"
        triggerAriaLabel={t("worktree.label")}
        triggerClassName={cn("max-w-45", triggerClassName)}
        triggerLabel={
          <span className="flex min-w-0 items-center gap-1.5">
            <GitFork className="size-3.5 shrink-0" />
            <span className="truncate">{triggerText}</span>
          </span>
        }
        value={selectedValue}
        onValueChange={(next) => {
          if (next === CREATE_WORKTREE_VALUE) {
            setCreateOpen(true);
            return;
          }
          onSelect(workspacePathsEqual(next, workspaceRootPath) ? null : next);
        }}
      />
      <CreateWorktreeDialog
        open={createOpen}
        branches={branches}
        currentBranch={currentBranch ?? null}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
      />
    </>
  );
}
