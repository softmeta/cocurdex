import type {
  IssueLabel,
  IssueRecord,
  IssueSummary,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { Circle, Flag, FolderKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IssueFieldValues } from "./issue-dialog-types";
import { FieldMenu, LabelsChip, ParentChip } from "./issue-field-chips";

export type IssueChipValues = Pick<
  IssueFieldValues,
  "status" | "priority" | "workspaceId" | "parentId" | "labelIds"
>;

export interface IssueFieldOptions {
  statusOptions: Array<{ id: string; title: string }>;
  priorityOptions: Array<{ id: string; title: string }>;
  workspaces: WorkspaceRecord[];
  labels: IssueLabel[];
  issues: IssueRecord[];
}

export function IssueFieldRow({
  issueId,
  knownParent,
  values,
  options,
  onChange,
  onCreateLabel,
}: {
  issueId: string | null;
  knownParent: IssueSummary | null;
  values: IssueChipValues;
  options: IssueFieldOptions;
  onChange: (changes: Partial<IssueChipValues>) => void;
  onCreateLabel: (name: string) => Promise<IssueLabel | null>;
}) {
  const { t } = useTranslation("issues");
  const { statusOptions, priorityOptions, workspaces } = options;
  const statusLabel =
    statusOptions.find((o) => o.id === values.status)?.title ?? values.status;
  const priorityLabel =
    priorityOptions.find((o) => o.id === values.priority)?.title ??
    values.priority;
  const workspaceLabel = values.workspaceId
    ? (workspaces.find((w) => w.id === values.workspaceId)?.name ??
      t("dialog.unknownWorkspace"))
    : t("dialog.noWorkspace");
  const workspaceOptions = [
    { id: "", title: t("dialog.noWorkspace") },
    ...workspaces.map((w) => ({ id: w.id, title: w.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
      <FieldMenu
        icon={<Circle className="size-3.5" strokeWidth={2.25} />}
        label={statusLabel}
        options={statusOptions}
        value={values.status}
        onChange={(status) => onChange({ status })}
        ariaLabel={t("dialog.status")}
      />
      <FieldMenu
        icon={<Flag className="size-3.5" />}
        label={priorityLabel}
        options={priorityOptions}
        value={values.priority}
        onChange={(priority) => onChange({ priority })}
        ariaLabel={t("dialog.priority")}
      />
      <FieldMenu
        icon={<FolderKanban className="size-3.5" />}
        label={workspaceLabel}
        options={workspaceOptions}
        value={values.workspaceId ?? ""}
        onChange={(id) => onChange({ workspaceId: id || null })}
        ariaLabel={t("dialog.workspace")}
      />
      <LabelsChip
        labels={options.labels}
        value={values.labelIds}
        onChange={(labelIds) => onChange({ labelIds })}
        onCreateLabel={onCreateLabel}
      />
      <ParentChip
        issueId={issueId}
        issues={options.issues}
        knownParent={knownParent}
        value={values.parentId}
        onChange={(parentId) => onChange({ parentId })}
      />
    </div>
  );
}
