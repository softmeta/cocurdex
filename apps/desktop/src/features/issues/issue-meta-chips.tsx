import type {
  IssueDisplayProperty,
  IssueRecord,
  ViewGroupBy,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import {
  CalendarClock,
  CalendarPlus,
  Flag,
  FolderKanban,
  GitBranchPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import { priorityFieldColor } from "./group-field-color";
import {
  formatIssueDate,
  issueDisplayPropertiesAtom,
  issueIdentifiersByIdAtom,
  workspaceNamesByIdAtom,
} from "./issue-display-store";
import { IssueLabelChips } from "./issue-label-chips";

function MetaChip({
  icon,
  label,
  title,
}: {
  icon: ReactNode;
  label: string;
  title?: string;
}) {
  return (
    <Text
      as="span"
      size="meta"
      truncate
      title={title}
      className="inline-flex h-5 max-w-40 items-center gap-1 rounded-full border border-editor-border/70 px-1.5 text-editor-fg-muted"
    >
      {icon}
      {label}
    </Text>
  );
}

export function IssueMetaChips({
  card,
  groupBy,
  priorityTitle,
  omit,
  className,
}: {
  card: IssueRecord;
  groupBy: ViewGroupBy;
  priorityTitle?: string;
  omit?: IssueDisplayProperty;
  className?: string;
}) {
  const { t } = useTranslation("issues");
  const properties = useAtomValue(issueDisplayPropertiesAtom);
  const identifiers = useAtomValue(issueIdentifiersByIdAtom);
  const workspaceNames = useAtomValue(workspaceNamesByIdAtom);
  const priorityColor = priorityFieldColor(card.priority);
  const workspaceName = card.workspaceId
    ? workspaceNames.get(card.workspaceId)
    : undefined;
  const parentIdentifier = card.parentId
    ? identifiers.get(card.parentId)
    : undefined;
  const chips = [
    properties.has("priority") &&
    omit !== "priority" &&
    groupBy !== "priority" &&
    card.priority !== "none" ? (
      <MetaChip
        key="priority"
        icon={
          <Flag
            aria-hidden
            className="size-3 shrink-0"
            style={priorityColor ? { color: priorityColor } : undefined}
          />
        }
        label={priorityTitle ?? card.priority}
      />
    ) : null,
    properties.has("workspace") && groupBy !== "workspace" && workspaceName ? (
      <MetaChip
        key="workspace"
        icon={<FolderKanban aria-hidden className="size-3 shrink-0" />}
        label={workspaceName}
      />
    ) : null,
    properties.has("parent") && groupBy !== "parent" && parentIdentifier ? (
      <MetaChip
        key="parent"
        icon={<GitBranchPlus aria-hidden className="size-3 shrink-0" />}
        label={parentIdentifier}
      />
    ) : null,
    properties.has("created") ? (
      <MetaChip
        key="created"
        icon={<CalendarPlus aria-hidden className="size-3 shrink-0" />}
        label={formatIssueDate(card.createdAt)}
        title={t("list.createdOn", { date: formatIssueDate(card.createdAt) })}
      />
    ) : null,
    properties.has("updated") ? (
      <MetaChip
        key="updated"
        icon={<CalendarClock aria-hidden className="size-3 shrink-0" />}
        label={formatIssueDate(card.updatedAt)}
        title={t("list.updatedOn", { date: formatIssueDate(card.updatedAt) })}
      />
    ) : null,
  ].filter(Boolean);
  const showLabels = properties.has("labels") && card.labelIds.length > 0;
  if (chips.length === 0 && !showLabels) return null;
  return (
    <span
      className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}
    >
      {chips}
      {showLabels ? (
        <IssueLabelChips labelIds={card.labelIds} className="contents" />
      ) : null}
    </span>
  );
}
