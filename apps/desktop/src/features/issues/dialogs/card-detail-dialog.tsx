import type {
  IssueDetail,
  IssueLabel,
  IssueRecord,
  ViewGroupBy,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle, Text } from "@/components/ui";
import type {
  IssueComposeDraft,
  IssueDetailActions,
  IssueSaveRequest,
} from "./issue-dialog-types";
import { IssueForm } from "./issue-form";

interface CardDetailDialogProps {
  card: IssueRecord | null;
  detail: IssueDetail | null;
  composeDraft: IssueComposeDraft | null;
  bodyEpoch?: number;
  bodyStatus?: "loading" | "ready" | "error";
  open: boolean;
  viewTitle: string;
  statusOptions: Array<{ id: string; title: string }>;
  priorityOptions: Array<{ id: string; title: string }>;
  workspaces: WorkspaceRecord[];
  labels: IssueLabel[];
  issues: IssueRecord[];
  groupBy: ViewGroupBy;
  actions: IssueDetailActions;
  onClose: () => void;
  onSave: (request: IssueSaveRequest) => Promise<boolean>;
}

export function CardDetailDialog({
  card,
  detail,
  composeDraft,
  bodyEpoch = 0,
  bodyStatus = "loading",
  open,
  viewTitle,
  statusOptions,
  priorityOptions,
  workspaces,
  labels,
  issues,
  actions,
  onClose,
  onSave,
}: CardDetailDialogProps) {
  const snapshotRef = useRef<{
    card: IssueRecord | null;
    detail: IssueDetail | null;
    composeDraft: IssueComposeDraft | null;
    bodyEpoch: number;
    bodyStatus: "loading" | "ready" | "error";
    viewTitle: string;
    formKey: string;
    isCreate: boolean;
  } | null>(null);

  if (card || composeDraft) {
    snapshotRef.current = {
      card,
      detail,
      composeDraft,
      bodyEpoch,
      bodyStatus,
      viewTitle,
      isCreate: card === null && composeDraft !== null,
      formKey:
        card?.id ?? (composeDraft ? `new-${composeDraft.columnId}` : "closed"),
    };
  }

  const snap = snapshotRef.current;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="default"
        className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton
      >
        {snap ? (
          <>
            <div className="flex items-center gap-1.5 border-b border-editor-border/60 px-5 py-3">
              <DialogTitle className="flex min-w-0 items-center gap-1.5 text-meta font-medium text-editor-fg-muted">
                <Text size="meta" className="truncate text-editor-fg-subtle">
                  {snap.viewTitle}
                </Text>
                <span className="text-editor-fg-subtle" aria-hidden>
                  ›
                </span>
                <span className="truncate text-editor-fg">
                  {snap.isCreate ? (
                    <CreateTitleLabel />
                  ) : (
                    <EditTitleLabel identifier={snap.card?.identifier} />
                  )}
                </span>
              </DialogTitle>
            </div>
            <IssueForm
              key={snap.formKey}
              card={snap.card}
              detail={snap.detail}
              composeDraft={snap.composeDraft}
              bodyEpoch={snap.bodyEpoch}
              bodyStatus={snap.bodyStatus}
              statusOptions={statusOptions}
              priorityOptions={priorityOptions}
              workspaces={workspaces}
              labels={labels}
              issues={issues}
              actions={actions}
              isCreate={snap.isCreate}
              onClose={onClose}
              onSave={onSave}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateTitleLabel() {
  const { t } = useTranslation("issues");
  return <>{t("dialog.newIssue")}</>;
}

function EditTitleLabel({ identifier }: { identifier?: string }) {
  const { t } = useTranslation("issues");
  return (
    <>
      {identifier ? (
        <span className="tabular-nums text-editor-fg-subtle">{identifier}</span>
      ) : (
        t("dialog.editCard")
      )}
    </>
  );
}
