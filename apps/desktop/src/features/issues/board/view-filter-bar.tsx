import type {
  IssueFieldOption,
  IssueLabel,
  ViewFilter,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { BookmarkPlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, IconButton, Text } from "@/components/ui";
import { useViewFilterChips } from "./use-view-filter-chips";

export function ViewFilterBar({
  filters,
  workspaces,
  labels,
  statuses,
  scopeLabel,
  canSave,
  onFiltersChange,
  onSave,
}: {
  filters: ViewFilter[];
  workspaces: WorkspaceRecord[];
  labels: IssueLabel[];
  statuses: IssueFieldOption[];
  scopeLabel: string | null;
  canSave: boolean;
  onFiltersChange: (filters: ViewFilter[]) => void;
  onSave: (title: string) => void;
}) {
  const { t } = useTranslation("issues");
  const chips = useViewFilterChips(filters, workspaces, labels, statuses);
  if (chips.length === 0) {
    return null;
  }
  const viewTitle = [scopeLabel, ...chips.map((chip) => chip.value)]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-label={t("filter.activeFilters")}
      className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pb-2"
    >
      {chips.map((chip) => (
        <div
          key={chip.key}
          className="inline-flex h-6 max-w-64 items-center gap-1 rounded-full border border-editor-border/70 bg-editor-chrome ps-2.5 pe-0.5"
        >
          <Text size="meta" truncate className="text-editor-fg-muted">
            {chip.field}
          </Text>
          <Text size="meta" truncate className="text-editor-fg">
            {chip.value}
          </Text>
          <IconButton
            size="xs"
            variant="ghost"
            className="rounded-full"
            aria-label={t("filter.remove", {
              filter: `${chip.field} ${chip.value}`,
            })}
            onClick={() => onFiltersChange(chip.remove(filters))}
          >
            <X className="size-3" />
          </IconButton>
        </div>
      ))}
      {canSave ? (
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto"
          onClick={() => onSave(viewTitle)}
        >
          <BookmarkPlus className="size-3.5" />
          {t("filter.saveAsView")}
        </Button>
      ) : null}
    </section>
  );
}
