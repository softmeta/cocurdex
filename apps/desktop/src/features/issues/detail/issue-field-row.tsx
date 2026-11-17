import type {
  IssueFieldOption,
  IssueLabel,
  IssueRecord,
  IssueSummary,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { Flag, FolderKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import { IssueStatusIcon } from "../issue-status-icon";
import type { IssueFieldValues } from "./issue-dialog-types";
import {
  FieldMenu,
  type IssueFieldLayout,
  LabelsChip,
  ParentChip,
} from "./issue-field-chips";

export type IssueChipValues = Pick<
  IssueFieldValues,
  "status" | "priority" | "workspaceId" | "parentId" | "labelIds"
>;

export interface IssueFieldOptions {
  statusOptions: IssueFieldOption[];
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
  layout = "chips",
}: {
  issueId: string | null;
  knownParent: IssueSummary | null;
  values: IssueChipValues;
  options: IssueFieldOptions;
  onChange: (changes: Partial<IssueChipValues>) => void;
  onCreateLabel: (name: string) => Promise<IssueLabel | null>;
  layout?: IssueFieldLayout;
}) {
  const { t } = useTranslation("issues");
  const { statusOptions, priorityOptions, workspaces } = options;
  const currentStatus = statusOptions.find((o) => o.id === values.status);
  const statusLabel = currentStatus?.title ?? values.status;
  const statusMenuOptions = statusOptions.map((option) => ({
    ...option,
    icon: <IssueStatusIcon statusId={option.id} category={option.category} />,
  }));
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
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 px-5 py-3",
        layout === "adaptive" &&
          "@4xl/issue:col-start-2 @4xl/issue:row-span-2 @4xl/issue:row-start-1 @4xl/issue:flex-col @4xl/issue:items-stretch @4xl/issue:gap-0.5 @4xl/issue:self-start @4xl/issue:px-0 @4xl/issue:pt-9",
      )}
    >
      {layout === "adaptive" ? (
        <Text
          size="meta"
          tone="muted"
          className="hidden px-2 pb-1 @4xl/issue:block"
        >
          {t("detail.properties")}
        </Text>
      ) : null}
      <FieldMenu
        layout={layout}
        icon={
          <IssueStatusIcon
            statusId={values.status}
            category={currentStatus?.category ?? null}
          />
        }
        label={statusLabel}
        options={statusMenuOptions}
        value={values.status}
        onChange={(status) => onChange({ status })}
        ariaLabel={t("dialog.status")}
      />
      <FieldMenu
        layout={layout}
        icon={<Flag className="size-3.5" />}
        label={priorityLabel}
        options={priorityOptions}
        value={values.priority}
        onChange={(priority) => onChange({ priority })}
        ariaLabel={t("dialog.priority")}
      />
      <FieldMenu
        layout={layout}
        icon={<FolderKanban className="size-3.5" />}
        label={workspaceLabel}
        options={workspaceOptions}
        value={values.workspaceId ?? ""}
        onChange={(id) => onChange({ workspaceId: id || null })}
        ariaLabel={t("dialog.workspace")}
      />
      <LabelsChip
        layout={layout}
        labels={options.labels}
        value={values.labelIds}
        onChange={(labelIds) => onChange({ labelIds })}
        onCreateLabel={onCreateLabel}
      />
      <ParentChip
        layout={layout}
        issueId={issueId}
        issues={options.issues}
        knownParent={knownParent}
        value={values.parentId}
        onChange={(parentId) => onChange({ parentId })}
      />
    </div>
  );
}
