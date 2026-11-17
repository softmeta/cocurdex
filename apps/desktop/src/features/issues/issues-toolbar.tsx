import type {
  IssueFieldOption,
  IssueLabel,
  ViewDisplay,
  ViewFilter,
  ViewGroupBy,
  ViewLayout,
  ViewSummary,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PanelToolbar } from "@/app/layout/panel-toolbar";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import { ViewDisplayMenu, ViewFilterBar, ViewFilterMenu } from "./board";
import {
  canSaveNavScope,
  type IssueNavSelection,
  IssueScopeTabs,
} from "./sidebar";

export function IssuesToolbar({
  selection,
  pinnedViews,
  viewTitle,
  scopeLabel,
  leading,
  showViewControls,
  filters,
  workspaces,
  labels,
  statuses,
  layout,
  groupBy,
  onSelect,
  onFiltersChange,
  onLayoutChange,
  onGroupByChange,
  display,
  onDisplayChange,
  onSaveView,
  onNewIssue,
}: {
  selection: IssueNavSelection;
  pinnedViews: readonly ViewSummary[];
  viewTitle: string;
  scopeLabel: string | null;
  leading: ReactNode;
  showViewControls: boolean;
  filters: ViewFilter[];
  workspaces: WorkspaceRecord[];
  labels: IssueLabel[];
  statuses: IssueFieldOption[];
  layout: ViewLayout;
  groupBy: ViewGroupBy;
  onSelect: (selection: IssueNavSelection) => void;
  onFiltersChange: (filters: ViewFilter[]) => void;
  onLayoutChange: (layout: ViewLayout) => void;
  onGroupByChange: (groupBy: ViewGroupBy) => void;
  display: ViewDisplay | undefined;
  onDisplayChange: (display: ViewDisplay) => void;
  onSaveView: (title: string) => void;
  onNewIssue: (() => void) | null;
}) {
  const { t } = useTranslation("issues");
  return (
    <>
      <PanelToolbar className="gap-1" divided={false}>
        {leading}
        <Text
          size="body"
          weight="medium"
          truncate
          className={cn("me-auto", leading && "ps-0.5", !leading && "ps-1")}
        >
          {viewTitle}
        </Text>
        {onNewIssue ? (
          <TitlebarIconButton
            aria-label={t("dialog.newIssue")}
            onClick={onNewIssue}
          >
            <Plus className="size-3.5" />
          </TitlebarIconButton>
        ) : null}
      </PanelToolbar>
      <div
        className="flex h-8 shrink-0 items-center gap-1 ps-5 pe-3 py-2 box-content"
        data-testid="issues-view-display-bar"
      >
        <div className="scrollbar-hide me-auto flex min-w-0 items-center overflow-x-auto">
          <IssueScopeTabs
            selection={selection}
            pinnedViews={pinnedViews}
            onSelect={onSelect}
          />
        </div>
        {showViewControls ? (
          <>
            <ViewFilterMenu
              filters={filters}
              workspaces={workspaces}
              labels={labels}
              statuses={statuses}
              onFiltersChange={onFiltersChange}
            />
            <ViewDisplayMenu
              layout={layout}
              groupBy={groupBy}
              onLayoutChange={onLayoutChange}
              onGroupByChange={onGroupByChange}
              display={display}
              onDisplayChange={onDisplayChange}
            />
          </>
        ) : null}
      </div>
      {showViewControls ? (
        <ViewFilterBar
          filters={filters}
          workspaces={workspaces}
          labels={labels}
          statuses={statuses}
          scopeLabel={scopeLabel}
          canSave={canSaveNavScope(selection)}
          onFiltersChange={onFiltersChange}
          onSave={onSaveView}
        />
      ) : null}
    </>
  );
}
