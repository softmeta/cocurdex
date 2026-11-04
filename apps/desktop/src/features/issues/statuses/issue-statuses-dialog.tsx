import {
  ISSUE_STATUS_CATEGORIES,
  type IssueStatusCategory,
  sortIssueColumns,
  type ViewColumnRecord,
} from "@cocurdex/shared";
import { useAtom } from "jotai";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog } from "@/components";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
  Text,
} from "@/components/ui";
import { issueStatusApi, useIssueStatuses } from "./issue-status-queries";
import { IssueStatusRow } from "./issue-status-row";
import { issueStatusesDialogOpenAtom } from "./issue-statuses-dialog-store";

function useCategoryLabels(): Record<IssueStatusCategory, string> {
  const { t } = useTranslation("issues");
  return {
    backlog: t("category.backlog"),
    unstarted: t("category.unstarted"),
    started: t("category.started"),
    completed: t("category.completed"),
    canceled: t("category.canceled"),
  };
}

export function IssueStatusesDialog() {
  const { t } = useTranslation("issues");
  const [open, setOpen] = useAtom(issueStatusesDialogOpenAtom);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <DialogHeader className="pe-8">
          <DialogTitle>{t("statuses.title")}</DialogTitle>
          <DialogDescription>{t("statuses.description")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 overflow-y-auto px-4">
          <IssueStatusList />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IssueStatusList() {
  const { t } = useTranslation("issues");
  const categoryLabels = useCategoryLabels();
  const { data, mutate } = useIssueStatuses();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ViewColumnRecord | null>(
    null,
  );
  const statuses = sortIssueColumns(data ?? []);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("statuses.saveFailed"),
      );
    } finally {
      await mutate();
    }
  };

  const create = (category: IssueStatusCategory) =>
    run(async () => {
      const created = await issueStatusApi.create(
        category,
        t("statuses.newTitle"),
      );
      setEditingId(created.id);
    });

  const confirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (target) void run(() => issueStatusApi.remove(target.id));
  };

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4 pb-1">
      {ISSUE_STATUS_CATEGORIES.map((category) => {
        const members = statuses.filter(
          (status) => status.category === category,
        );
        return (
          <section key={category} className="flex flex-col">
            <div className="flex h-7 items-center justify-between">
              <Text size="meta" weight="medium" tone="muted">
                {categoryLabels[category]}
              </Text>
              <IconButton
                aria-label={t("statuses.add", {
                  category: categoryLabels[category],
                })}
                size="xs"
                onClick={() => void create(category)}
              >
                <Plus />
              </IconButton>
            </div>
            {members.length === 0 ? (
              <Text className="py-2" tone="muted">
                {t("statuses.empty")}
              </Text>
            ) : (
              <ul
                aria-label={categoryLabels[category]}
                className="flex flex-col divide-y divide-border/40"
              >
                {members.map((status, index) => (
                  <IssueStatusRow
                    key={status.id}
                    status={status}
                    categoryLabels={categoryLabels}
                    editing={editingId === status.id}
                    canMoveUp={index > 0}
                    canMoveDown={index < members.length - 1}
                    canDelete={statuses.length > 1}
                    onEditingChange={(editing) =>
                      setEditingId(editing ? status.id : null)
                    }
                    onRename={(title) =>
                      void run(() => issueStatusApi.rename(status.id, title))
                    }
                    onCategoryChange={(next) =>
                      void run(() =>
                        issueStatusApi.setCategory(status.id, next),
                      )
                    }
                    onMove={(offset) =>
                      void run(() =>
                        issueStatusApi.move(
                          statuses,
                          status.id,
                          index + offset,
                        ),
                      )
                    }
                    onDelete={() => setPendingDelete(status)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <AppConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("statuses.deleteTitle", {
          status: pendingDelete?.title ?? "",
        })}
        description={t("statuses.deleteDescription")}
        cancelLabel={t("statuses.cancel")}
        confirmLabel={t("statuses.delete")}
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
