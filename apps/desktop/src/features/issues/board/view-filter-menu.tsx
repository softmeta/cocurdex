import type { ViewFilter, WorkspaceRecord } from "@cocurdex/shared";
import { FolderKanban, ListFilter } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { AppDropdownRadioList } from "@/components";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
} from "@/components/ui";

/** Sentinel for “no project” in the filter menu (maps to is_null). */
export const FILTER_NO_PROJECT = "__no_project__";
/** Sentinel for clearing all filters (show every issue). */
export const FILTER_ALL = "__all__";

interface ViewFilterMenuProps {
  filters: ViewFilter[];
  workspaces: WorkspaceRecord[];
  onFiltersChange: (filters: ViewFilter[]) => void;
}

/**
 * View-scoped filter control (Linear-style). v1: Project / No project only.
 * Writes filters onto the active view (persisted in view.yml).
 */
export function ViewFilterMenu({
  filters,
  workspaces,
  onFiltersChange,
}: ViewFilterMenuProps) {
  const { t } = useTranslation("issues");
  const [open, setOpen] = useState(false);

  const selection = useMemo(() => {
    const workspaceFilter = filters.find((f) => f.field === "workspaceId");
    if (!workspaceFilter) return FILTER_ALL;
    if (workspaceFilter.op === "is_null") return FILTER_NO_PROJECT;
    if (workspaceFilter.op === "eq" && workspaceFilter.value) {
      return workspaceFilter.value;
    }
    return FILTER_ALL;
  }, [filters]);

  const active = selection !== FILTER_ALL;

  const applySelection = (next: string) => {
    if (next === FILTER_ALL) {
      onFiltersChange([]);
      return;
    }
    if (next === FILTER_NO_PROJECT) {
      onFiltersChange([{ field: "workspaceId", op: "is_null" }]);
      return;
    }
    onFiltersChange([{ field: "workspaceId", op: "eq", value: next }]);
  };

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
      <DropdownMenuContent align="end" className="min-w-52">
        {/* Base UI GroupLabel requires Menu.Group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1.5">
            <FolderKanban className="size-3.5 text-editor-fg-subtle" />
            <Text size="meta" weight="medium" className="text-editor-fg-subtle">
              {t("filter.project")}
            </Text>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <AppDropdownRadioList
          value={selection}
          onValueChange={(next) => {
            applySelection(next);
            setOpen(false);
          }}
          options={[
            { value: FILTER_ALL, label: t("filter.allProjects") },
            { value: FILTER_NO_PROJECT, label: t("filter.noProject") },
            ...workspaces.map((workspace) => ({
              value: workspace.id,
              label: workspace.name,
            })),
          ]}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
