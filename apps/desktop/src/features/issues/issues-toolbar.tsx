import type {
  IssueFieldOption,
  IssueLabel,
  ViewDisplay,
  ViewFilter,
  ViewGroupBy,
  ViewLayout,
  WorkspaceRecord,
} from "@cocurdex/shared";
import type { ReactNode } from "react";
import { PanelToolbar } from "@/app/layout/panel-toolbar";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import { ViewDisplayMenu, ViewFilterBar, ViewFilterMenu } from "./board";
import { type IssueNavSelection, IssueScopeTabs } from "./sidebar";

export function IssuesToolbar({
  selection,
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
}: {
  selection: IssueNavSelection;
  viewTitle: string | null;
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
}) {
  return (
    <>
      <PanelToolbar
        className="gap-1"
        data-testid="issues-view-display-bar"
        divided={false}
      >
        {leading}
        <div
          className={cn(
            "scrollbar-hide me-auto flex min-w-0 items-center gap-2 overflow-x-auto",
            leading && "ps-0.5",
            !leading && "ps-1",
          )}
        >
          <IssueScopeTabs selection={selection} onSelect={onSelect} />
          {viewTitle ? (
            <Text size="body" weight="medium" className="shrink-0">
              {viewTitle}
            </Text>
          ) : null}
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
      </PanelToolbar>
      {showViewControls ? (
        <ViewFilterBar
          filters={filters}
          workspaces={workspaces}
          labels={labels}
          statuses={statuses}
          scopeLabel={scopeLabel}
          canSave={selection.kind === "issues"}
          onFiltersChange={onFiltersChange}
          onSave={onSaveView}
        />
      ) : null}
    </>
  );
}
