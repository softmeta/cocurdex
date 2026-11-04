import type { IssueLabel } from "@cocurdex/shared";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MarkdownBodyEditor,
  type MarkdownBodyEditorHandle,
} from "@/components/markdown-body-editor";
import { Button } from "@/components/ui";
import type {
  IssueComposeDraft,
  IssueFieldValues,
  IssueSaveRequest,
} from "./issue-dialog-types";
import {
  type IssueChipValues,
  type IssueFieldOptions,
  IssueFieldRow,
} from "./issue-field-row";

export function IssueCreateForm({
  composeDraft,
  options,
  onCreateLabel,
  onClose,
  onSave,
}: {
  composeDraft: IssueComposeDraft;
  options: IssueFieldOptions;
  onCreateLabel: (name: string) => Promise<IssueLabel | null>;
  onClose: () => void;
  onSave: (request: IssueSaveRequest) => Promise<boolean>;
}) {
  const { t } = useTranslation("issues");
  const [title, setTitle] = useState("");
  const descriptionRef = useRef<MarkdownBodyEditorHandle>(null);
  const [chips, setChips] = useState<IssueChipValues>({
    status: composeDraft.status || options.statusOptions[0]?.id || "",
    priority: composeDraft.priority || options.priorityOptions.at(-1)?.id || "",
    workspaceId: composeDraft.workspaceId,
    parentId: composeDraft.parentId,
    labelIds: [],
  });
  const [saving, setSaving] = useState(false);
  const canCreate = !saving && title.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) {
      return;
    }
    const values: IssueFieldValues = {
      ...chips,
      title: title.trim(),
      description: descriptionRef.current?.getMarkdown().trim() || null,
    };
    setSaving(true);
    const saved = await onSave({
      kind: "create",
      columnId: composeDraft.columnId,
      values,
    });
    setSaving(false);
    if (saved) {
      onClose();
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-1 px-5 pt-4 pb-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("dialog.titlePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleCreate();
              }
            }}
            className="w-full border-0 bg-transparent text-display font-medium text-editor-fg outline-none placeholder:text-editor-fg-subtle"
          />
          <MarkdownBodyEditor
            ref={descriptionRef}
            initialMarkdown=""
            placeholder={t("dialog.descriptionPlaceholder")}
            className="min-h-28 max-h-80 overflow-y-auto"
          />
        </div>
        <IssueFieldRow
          issueId={null}
          knownParent={null}
          values={chips}
          options={options}
          onChange={(changes) => setChips((prev) => ({ ...prev, ...changes }))}
          onCreateLabel={onCreateLabel}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-editor-border/60 px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          {t("dialog.cancel")}
        </Button>
        <Button
          onClick={() => {
            void handleCreate();
          }}
          disabled={!canCreate}
        >
          {t("dialog.createIssue")}
        </Button>
      </div>
    </div>
  );
}
