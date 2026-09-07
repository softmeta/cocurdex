import { suggestWorktreeBranchName } from "@cocurdex/shared";
import { GitBranch } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSearchableSelect } from "@/components";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@/components/ui";
import type { GitBranchInfo } from "@/lib";

const HEAD_START_POINT = "HEAD";

interface CreateWorktreeDialogProps {
  open: boolean;
  branches: GitBranchInfo[];
  currentBranch: string | null;
  onOpenChange(open: boolean): void;
  onCreate(payload: { branch: string; startPoint?: string }): Promise<void>;
}

function resolveDefaultStartPoint(
  branches: GitBranchInfo[],
  currentBranch: string | null,
) {
  const hasCurrentBranch = branches.some(
    (branch) => branch.name === currentBranch,
  );
  if (currentBranch && hasCurrentBranch) {
    return currentBranch;
  }
  const current = branches.find((branch) => branch.current);
  if (current) {
    return current.name;
  }
  return branches[0]?.name ?? HEAD_START_POINT;
}

export function CreateWorktreeDialog({
  open,
  branches,
  currentBranch,
  onOpenChange,
  onCreate,
}: CreateWorktreeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="compact">
        {open ? (
          <CreateWorktreeForm
            branches={branches}
            currentBranch={currentBranch}
            onCancel={() => onOpenChange(false)}
            onCreate={onCreate}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateWorktreeForm({
  branches,
  currentBranch,
  onCancel,
  onCreate,
}: {
  branches: GitBranchInfo[];
  currentBranch: string | null;
  onCancel(): void;
  onCreate(payload: { branch: string; startPoint?: string }): Promise<void>;
}) {
  const { t } = useTranslation("sessions");
  const [branch, setBranch] = useState(() =>
    suggestWorktreeBranchName(crypto.randomUUID()),
  );
  const [startPointValue, setStartPointValue] = useState(() =>
    resolveDefaultStartPoint(branches, currentBranch),
  );
  const [isCreating, setIsCreating] = useState(false);
  const startPointOptions = useMemo(() => {
    const options = branches.map((item) => ({
      value: item.name,
      label: item.name,
      group: "branches",
      groupLabel: t("branch.branches"),
      icon: <GitBranch className="size-3.5" />,
    }));
    if (
      options.length === 0 ||
      !options.some((option) => option.value === startPointValue)
    ) {
      options.unshift({
        value: HEAD_START_POINT,
        label: t("worktree.startPointHead"),
        group: "branches",
        groupLabel: t("branch.branches"),
        icon: <GitBranch className="size-3.5" />,
      });
    }
    return options;
  }, [branches, startPointValue, t]);

  const handleSubmit = async () => {
    const nextBranch = branch.trim();
    if (!nextBranch || isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      await onCreate({
        branch: nextBranch,
        startPoint: startPointValue || undefined,
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("worktree.createTitle")}</DialogTitle>
        <DialogDescription>{t("worktree.createDescription")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="worktree-branch">{t("worktree.branchName")}</Label>
          <Input
            id="worktree-branch"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("worktree.startPoint")}</Label>
          <AppSearchableSelect
            emptyText={t("branch.empty")}
            options={startPointOptions}
            searchPlaceholder={t("branch.searchPlaceholder")}
            triggerAriaLabel={t("worktree.startPoint")}
            triggerClassName="h-8 w-full justify-between"
            value={startPointValue}
            onValueChange={setStartPointValue}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("worktree.cancel")}
        </Button>
        <Button
          disabled={!branch.trim() || isCreating}
          type="button"
          onClick={() => void handleSubmit()}
        >
          {t("worktree.createAction")}
        </Button>
      </DialogFooter>
    </>
  );
}
