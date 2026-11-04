import type { IssueLabel } from "@cocurdex/shared";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle, Text } from "@/components/ui";
import { IssueCreateForm } from "./issue-create-form";
import type { IssueComposeDraft, IssueSaveRequest } from "./issue-dialog-types";
import type { IssueFieldOptions } from "./issue-field-row";

export function IssueCreateDialog({
  composeDraft,
  viewTitle,
  options,
  onCreateLabel,
  onClose,
  onSave,
}: {
  composeDraft: IssueComposeDraft | null;
  viewTitle: string;
  options: IssueFieldOptions;
  onCreateLabel: (name: string) => Promise<IssueLabel | null>;
  onClose: () => void;
  onSave: (request: IssueSaveRequest) => Promise<boolean>;
}) {
  const { t } = useTranslation("issues");
  const lastDraftRef = useRef<IssueComposeDraft | null>(null);
  if (composeDraft) {
    lastDraftRef.current = composeDraft;
  }
  const draft = composeDraft ?? lastDraftRef.current;

  return (
    <Dialog open={composeDraft !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="default"
        className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton
      >
        {draft ? (
          <>
            <div className="flex items-center gap-1.5 border-b border-editor-border/60 px-5 py-3">
              <DialogTitle className="flex min-w-0 items-center gap-1.5 text-meta font-medium text-editor-fg-muted">
                <Text size="meta" className="truncate text-editor-fg-subtle">
                  {viewTitle}
                </Text>
                <span className="text-editor-fg-subtle" aria-hidden>
                  ›
                </span>
                <span className="truncate text-editor-fg">
                  {t("dialog.newIssue")}
                </span>
              </DialogTitle>
            </div>
            <IssueCreateForm
              key={`new-${draft.columnId}-${draft.parentId ?? ""}`}
              composeDraft={draft}
              options={options}
              onCreateLabel={onCreateLabel}
              onClose={onClose}
              onSave={onSave}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
