import type { ViewSummary } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { SidebarPanelHeader } from "@/app/layout/sidebar-panel-header";
import type { IssueNavSelection } from "./issue-nav";
import { IssueViewsSection } from "./issue-views-section";

interface IssuesSidebarProps {
  selection: IssueNavSelection;
  onSelect: (selection: IssueNavSelection) => void;
  views: ViewSummary[];
  onDeleteView: (viewId: string) => void;
  onRenameView: (title: string) => void;
  onCollapse: () => void;
}

export function IssuesSidebar({
  selection,
  onSelect,
  views,
  onDeleteView,
  onRenameView,
  onCollapse,
}: IssuesSidebarProps) {
  const { t } = useTranslation("issues");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
      <SidebarPanelHeader
        title={t("sidebar.nav.title")}
        collapseLabel={t("sidebar.collapse")}
        onCollapse={onCollapse}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <IssueViewsSection
          views={views}
          activeViewId={selection.kind === "view" ? selection.viewId : null}
          onSelectView={(viewId) => onSelect({ kind: "view", viewId })}
          onDeleteView={onDeleteView}
          onRenameView={onRenameView}
        />
      </div>
    </div>
  );
}
