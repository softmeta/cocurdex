import type {
  IssueFieldOption,
  IssueLabel,
  ViewFilter,
  WorkspaceRecord,
} from "@cocurdex/shared";
import {
  CalendarClock,
  CalendarPlus,
  CircleDashed,
  FolderKanban,
  GitFork,
  ListFilter,
  Tag,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { AppDropdownRadioList } from "@/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui";
import {
  DATE_FILTER_DAYS,
  type DateFilterField,
  dateSelection,
  FILTER_ALL,
  FILTER_NO_WORKSPACE,
  FILTER_TOP_LEVEL,
  hidesClosedIssues,
  labelSelection,
  parentSelection,
  statusSelection,
  withDateSelection,
  withHideClosedIssues,
  withLabelSelection,
  withParentSelection,
  withStatusSelection,
  withWorkspaceSelection,
  workspaceSelection,
} from "./view-filters";

interface ViewFilterMenuProps {
  filters: ViewFilter[];
  workspaces: WorkspaceRecord[];
  labels: IssueLabel[];
  statuses: IssueFieldOption[];
  onFiltersChange: (filters: ViewFilter[]) => void;
}

interface FilterOption {
  value: string;
  label: string;
}

function FilterSubmenu({
  icon,
  title,
  value,
  options,
  onValueChange,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  options: FilterOption[];
  onValueChange: (value: string) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {icon}
        {title}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 min-w-44">
        <AppDropdownRadioList
          value={value}
          onValueChange={onValueChange}
          options={options}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function ViewFilterMenu({
  filters,
  workspaces,
  labels,
  statuses,
  onFiltersChange,
}: ViewFilterMenuProps) {
  const { t } = useTranslation("issues");
  const [open, setOpen] = useState(false);
  const hideClosed = hidesClosedIssues(filters);
  const active = filters.length > 0;
  const apply = (next: ViewFilter[]) => {
    onFiltersChange(next);
    setOpen(false);
  };
  const dateOptions: FilterOption[] = [
    { value: FILTER_ALL, label: t("filter.anyTime") },
    ...DATE_FILTER_DAYS.map((days) => ({
      value: days,
      label: t("filter.withinDays", { count: Number(days) }),
    })),
  ];
  const dateFields: Array<{
    field: DateFilterField;
    title: string;
    icon: ReactNode;
  }> = [
    {
      field: "createdAt",
      title: t("filter.created"),
      icon: <CalendarPlus className="size-3.5" />,
    },
    {
      field: "updatedAt",
      title: t("filter.updated"),
      icon: <CalendarClock className="size-3.5" />,
    },
  ];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <TitlebarIconButton
          active={open || active}
          aria-expanded={open}
          aria-label={t("filter.ariaLabel")}
        >
          <ListFilter className="size-3.5" />
        </TitlebarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuCheckboxItem
          checked={hideClosed}
          closeOnClick={false}
          onCheckedChange={(checked) =>
            onFiltersChange(withHideClosedIssues(filters, checked === true))
          }
        >
          {t("filter.hideClosed")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {statuses.length > 0 ? (
          <FilterSubmenu
            icon={<CircleDashed className="size-3.5" />}
            title={t("filter.status")}
            value={statusSelection(filters)}
            onValueChange={(next) => apply(withStatusSelection(filters, next))}
            options={[
              { value: FILTER_ALL, label: t("filter.allStatuses") },
              ...statuses.map((status) => ({
                value: status.id,
                label: status.title,
              })),
            ]}
          />
        ) : null}
        <FilterSubmenu
          icon={<FolderKanban className="size-3.5" />}
          title={t("filter.workspace")}
          value={workspaceSelection(filters)}
          onValueChange={(next) => apply(withWorkspaceSelection(filters, next))}
          options={[
            { value: FILTER_ALL, label: t("filter.allWorkspaces") },
            { value: FILTER_NO_WORKSPACE, label: t("filter.noWorkspace") },
            ...workspaces.map((workspace) => ({
              value: workspace.id,
              label: workspace.name,
            })),
          ]}
        />
        {labels.length > 0 ? (
          <FilterSubmenu
            icon={<Tag className="size-3.5" />}
            title={t("filter.label")}
            value={labelSelection(filters)}
            onValueChange={(next) => apply(withLabelSelection(filters, next))}
            options={[
              { value: FILTER_ALL, label: t("filter.allLabels") },
              ...labels.map((label) => ({
                value: label.id,
                label: label.name,
              })),
            ]}
          />
        ) : null}
        <FilterSubmenu
          icon={<GitFork className="size-3.5" />}
          title={t("filter.parent")}
          value={parentSelection(filters)}
          onValueChange={(next) => apply(withParentSelection(filters, next))}
          options={[
            { value: FILTER_ALL, label: t("filter.allIssues") },
            { value: FILTER_TOP_LEVEL, label: t("filter.topLevel") },
          ]}
        />
        {dateFields.map((entry) => (
          <FilterSubmenu
            key={entry.field}
            icon={entry.icon}
            title={entry.title}
            value={dateSelection(filters, entry.field)}
            onValueChange={(next) =>
              apply(withDateSelection(filters, entry.field, next))
            }
            options={dateOptions}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
