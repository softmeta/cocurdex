import type {
  IssueDetail,
  IssueLabel,
  IssueRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { Circle, Flag, FolderKanban } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MarkdownBodyEditor,
  type MarkdownBodyEditorHandle,
} from "@/components/markdown-body-editor";
import { Button, Text } from "@/components/ui";
import { IssueActivity } from "./issue-activity";
import { IssueDetailSections } from "./issue-detail-sections";
import type {
  IssueComposeDraft,
  IssueDetailActions,
  IssueFieldValues,
  IssueSaveRequest,
} from "./issue-dialog-types";
import { FieldMenu, LabelsChip, ParentChip } from "./issue-field-chips";

function sameIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function changedIssueFields(
  card: IssueRecord,
  values: IssueFieldValues,
  descriptionChanged: boolean,
): Partial<IssueFieldValues> {
  const changes: Partial<IssueFieldValues> = {};
  if (values.title && values.title !== card.title) {
    changes.title = values.title;
  }
  if (descriptionChanged) {
    changes.description = values.description;
  }
  if (values.status !== card.status) {
    changes.status = values.status;
  }
  if (values.priority !== card.priority) {
    changes.priority = values.priority;
  }
  if (values.workspaceId !== card.workspaceId) {
    changes.workspaceId = values.workspaceId;
  }
  if (values.parentId !== card.parentId) {
    changes.parentId = values.parentId;
  }
  if (!sameIds(values.labelIds, card.labelIds)) {
    changes.labelIds = values.labelIds;
  }
  return changes;
}

export function IssueForm({
  card,
  detail,
  composeDraft,
  bodyEpoch,
  bodyStatus,
  statusOptions,
  priorityOptions,
  workspaces,
  labels,
  issues,
  actions,
  isCreate,
  onClose,
  onSave,
}: {
  card: IssueRecord | null;
  detail: IssueDetail | null;
  composeDraft: IssueComposeDraft | null;
  bodyEpoch: number;
  bodyStatus: "loading" | "ready" | "error";
  statusOptions: Array<{ id: string; title: string }>;
  priorityOptions: Array<{ id: string; title: string }>;
  workspaces: WorkspaceRecord[];
  labels: IssueLabel[];
  issues: IssueRecord[];
  actions: IssueDetailActions;
  isCreate: boolean;
  onClose: () => void;
  onSave: (request: IssueSaveRequest) => Promise<boolean>;
}) {
  const { t } = useTranslation("issues");
  const [title, setTitle] = useState(card?.title ?? "");
  const descriptionRef = useRef<MarkdownBodyEditorHandle>(null);
  const [status, setStatus] = useState(
    card?.status ?? composeDraft?.status ?? statusOptions[0]?.id ?? "",
  );
  const [priority, setPriority] = useState(
    card?.priority ??
      composeDraft?.priority ??
      priorityOptions.at(-1)?.id ??
      "",
  );
  const [saving, setSaving] = useState(false);
  const bodyReady = isCreate || bodyStatus === "ready";
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    card?.workspaceId ?? composeDraft?.workspaceId ?? null,
  );
  const [parentId, setParentId] = useState<string | null>(
    card?.parentId ?? composeDraft?.parentId ?? null,
  );
  const [labelIds, setLabelIds] = useState<string[]>(card?.labelIds ?? []);
  const bodyMarkdown = card?.description ?? "";

  const statusLabel =
    statusOptions.find((o) => o.id === status)?.title ?? status;
  const priorityLabel =
    priorityOptions.find((o) => o.id === priority)?.title ?? priority;
  const workspaceLabel = workspaceId
    ? (workspaces.find((w) => w.id === workspaceId)?.name ??
      t("dialog.unknownWorkspace"))
    : t("dialog.noWorkspace");

  const workspaceOptions: Array<{ id: string; title: string }> = [
    { id: "", title: t("dialog.noWorkspace") },
    ...workspaces.map((w) => ({ id: w.id, title: w.name })),
  ];

  const handleSave = async () => {
    if (!bodyReady || saving) {
      return;
    }
    const editor = descriptionRef.current;
    const values: IssueFieldValues = {
      title: title.trim(),
      description: editor?.getMarkdown().trim() || null,
      status,
      priority,
      workspaceId,
      parentId,
      labelIds,
    };
    let request: IssueSaveRequest | null = null;
    if (card) {
      const changes = changedIssueFields(
        card,
        values,
        editor?.isDirty() ?? false,
      );
      if (Object.keys(changes).length > 0) {
        request = {
          kind: "update",
          id: card.id,
          expectedRevision: card.revision,
          changes,
        };
      }
    } else if (composeDraft) {
      request = { kind: "create", columnId: composeDraft.columnId, values };
    }
    if (!request) {
      onClose();
      return;
    }
    setSaving(true);
    const saved = await onSave(request);
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
                void handleSave();
              }
            }}
            className="w-full border-0 bg-transparent text-display font-medium text-editor-fg outline-none placeholder:text-editor-fg-subtle"
          />
          {bodyReady ? (
            <MarkdownBodyEditor
              key={`body-${card?.id ?? "new"}-${bodyEpoch}`}
              ref={descriptionRef}
              initialMarkdown={bodyMarkdown}
              placeholder={t("dialog.descriptionPlaceholder")}
              className="min-h-28 max-h-80 overflow-y-auto"
            />
          ) : (
            <div className="min-h-28">
              {bodyStatus === "error" ? (
                <Text size="meta" tone="destructive">
                  {t("dialog.loadFailed")}
                </Text>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
          <FieldMenu
            icon={<Circle className="size-3.5" strokeWidth={2.25} />}
            label={statusLabel}
            options={statusOptions}
            value={status}
            onChange={setStatus}
            ariaLabel={t("dialog.status")}
          />
          <FieldMenu
            icon={<Flag className="size-3.5" />}
            label={priorityLabel}
            options={priorityOptions}
            value={priority}
            onChange={setPriority}
            ariaLabel={t("dialog.priority")}
          />
          <FieldMenu
            icon={<FolderKanban className="size-3.5" />}
            label={workspaceLabel}
            options={workspaceOptions}
            value={workspaceId ?? ""}
            onChange={(id) => setWorkspaceId(id || null)}
            ariaLabel={t("dialog.workspace")}
          />
          <LabelsChip
            labels={labels}
            value={labelIds}
            onChange={setLabelIds}
            onCreateLabel={actions.onCreateLabel}
          />
          <ParentChip
            issueId={card?.id ?? null}
            issues={issues}
            knownParent={detail?.parent ?? null}
            value={parentId}
            onChange={setParentId}
          />
        </div>
        {card && detail ? (
          <>
            <IssueDetailSections
              detail={detail}
              issues={issues}
              onOpenIssue={actions.onOpenIssue}
              onAddSubIssue={() => actions.onAddSubIssue(card)}
              onAddRelation={actions.onAddRelation}
              onRemoveRelation={actions.onRemoveRelation}
            />
            <IssueActivity
              events={detail.events}
              statusOptions={statusOptions}
              priorityOptions={priorityOptions}
              onComment={actions.onComment}
            />
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-editor-border/60 px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          {t("dialog.cancel")}
        </Button>
        <Button
          onClick={() => {
            void handleSave();
          }}
          disabled={!bodyReady || saving || (isCreate && !title.trim())}
        >
          {isCreate ? t("dialog.createIssue") : t("dialog.save")}
        </Button>
      </div>
    </div>
  );
}
