import type { IssueLabel, ViewFilter, WorkspaceRecord } from "@cocurdex/shared";
import { FolderKanban, ListFilter, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { AppDropdownRadioList } from "@/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
} from "@/components/ui";
import {
  FILTER_ALL,
  FILTER_NO_WORKSPACE,
  hidesClosedIssues,
  labelSelection,
  withHideClosedIssues,
  withLabelSelection,
  withWorkspaceSelection,
  workspaceSelection,
} from "./view-filters";

interface ViewFilterMenuProps {
  filters: ViewFilter[];
  workspaces: WorkspaceRecord[];
  labels: IssueLabel[];
  onFiltersChange: (filters: ViewFilter[]) => void;
}

function FilterSectionLabel({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1.5">
        {icon}
        <Text size="meta" weight="medium" className="text-editor-fg-subtle">
          {children}
        </Text>
      </DropdownMenuLabel>
    </DropdownMenuGroup>
  );
}

export function ViewFilterMenu({
  filters,
  workspaces,
  labels,
  onFiltersChange,
}: ViewFilterMenuProps) {
  const { t } = useTranslation("issues");
  const [open, setOpen] = useState(false);
  const hideClosed = hidesClosedIssues(filters);
  const active = filters.length > 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <TitlebarIconButton
          active={open || active}
          aria-expanded={open}
          aria-label={t("filter.ariaLabel")}
        >
          <ListFilter className={TITLEBAR_ICON_GLYPH_CLASS} />
        </TitlebarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 min-w-52">
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
        <FilterSectionLabel
          icon={<FolderKanban className="size-3.5 text-editor-fg-subtle" />}
        >
          {t("filter.workspace")}
        </FilterSectionLabel>
        <AppDropdownRadioList
          value={workspaceSelection(filters)}
          onValueChange={(next) => {
            onFiltersChange(withWorkspaceSelection(filters, next));
            setOpen(false);
          }}
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
          <>
            <DropdownMenuSeparator />
            <FilterSectionLabel
              icon={<Tag className="size-3.5 text-editor-fg-subtle" />}
            >
              {t("filter.label")}
            </FilterSectionLabel>
            <AppDropdownRadioList
              value={labelSelection(filters)}
              onValueChange={(next) => {
                onFiltersChange(withLabelSelection(filters, next));
                setOpen(false);
              }}
              options={[
                { value: FILTER_ALL, label: t("filter.allLabels") },
                ...labels.map((label) => ({
                  value: label.id,
                  label: label.name,
                })),
              ]}
            />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
