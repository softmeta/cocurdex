import type {
  IssueActivityLookup,
  IssueRecord,
  ViewSummary,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { SidebarPanelHeader } from "@/app/layout/sidebar-panel-header";
import { type IssueNavSelection, navPlace } from "./issue-nav";
import {
  IssueAgentSection,
  IssueAllRow,
  IssueWorkspacesSection,
  type PlaceContext,
} from "./issue-places-section";
import { IssueViewsSection } from "./issue-views-section";

interface IssuesSidebarProps {
  selection: IssueNavSelection;
  onSelect: (selection: IssueNavSelection) => void;
  issues: readonly IssueRecord[];
  workspaces: readonly WorkspaceRecord[];
  activityOf: IssueActivityLookup;
  views: ViewSummary[];
  onDeleteView: (viewId: string) => void;
  onRenameView: (title: string) => void;
  onTogglePin: (pinned: boolean) => void;
}

export function IssuesSidebar({
  selection,
  onSelect,
  issues,
  workspaces,
  activityOf,
  views,
  onDeleteView,
  onRenameView,
  onTogglePin,
}: IssuesSidebarProps) {
  const { t } = useTranslation("issues");
  const preset = selection.kind === "issues" ? selection.preset : "all";
  const context: PlaceContext = {
    issues,
    preset,
    activePlace: selection.kind === "issues" ? navPlace(selection) : null,
    activityOf,
    onSelectPlace: (place) => onSelect({ kind: "issues", preset, place }),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
      <SidebarPanelHeader title={t("sidebar.nav.title")} />

      <nav
        aria-label={t("sidebar.nav.title")}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
      >
        <IssueAllRow context={context} />
        <IssueAgentSection context={context} />
        <IssueWorkspacesSection workspaces={workspaces} context={context} />
        <IssueViewsSection
          views={views}
          activeViewId={selection.kind === "view" ? selection.viewId : null}
          onSelectView={(viewId) => onSelect({ kind: "view", viewId })}
          onDeleteView={onDeleteView}
          onRenameView={onRenameView}
          onTogglePin={onTogglePin}
        />
      </nav>
    </div>
  );
}
