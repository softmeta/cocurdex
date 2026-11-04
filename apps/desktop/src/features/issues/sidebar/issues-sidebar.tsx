import type { ViewSummary } from "@cocurdex/shared";
import { Bot, ListTodo } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SidebarPanelHeader } from "@/app/layout/sidebar-panel-header";
import {
  type IssueNavPreset,
  type IssueNavSelection,
  isSameIssueNav,
} from "./issue-nav";
import { IssueNavRow } from "./issue-nav-row";
import { IssueViewsSection } from "./issue-views-section";

interface IssuesSidebarProps {
  selection: IssueNavSelection;
  onSelect: (selection: IssueNavSelection) => void;
  lastPreset: IssueNavPreset;
  agentRunningCount: number;
  views: ViewSummary[];
  onDeleteView: (viewId: string) => void;
  onRenameView: (title: string) => void;
  onCollapse: () => void;
}

export function IssuesSidebar({
  selection,
  onSelect,
  lastPreset,
  agentRunningCount,
  views,
  onDeleteView,
  onRenameView,
  onCollapse,
}: IssuesSidebarProps) {
  const { t } = useTranslation("issues");
  const agentSelection: IssueNavSelection = { kind: "agent" };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2">
      <SidebarPanelHeader
        title={t("sidebar.nav.title")}
        collapseLabel={t("sidebar.collapse")}
        onCollapse={onCollapse}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <IssueNavRow
          icon={ListTodo}
          label={t("sidebar.nav.issues")}
          isActive={selection.kind === "issues"}
          onSelect={() => onSelect({ kind: "issues", preset: lastPreset })}
        />
        <IssueNavRow
          icon={Bot}
          label={t("sidebar.nav.agent")}
          count={agentRunningCount}
          isActive={isSameIssueNav(selection, agentSelection)}
          onSelect={() => onSelect(agentSelection)}
        />
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
