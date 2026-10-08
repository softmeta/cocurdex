import type { ViewSummary } from "@cocurdex/shared";
import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SidebarPanelHeader } from "@/components";
import { type IssueNavSelection, isSameIssueNav } from "./issue-nav";
import { IssueNavRow } from "./issue-nav-row";
import { IssueViewsSection } from "./issue-views-section";
import { usePresetItems } from "./use-preset-items";

interface IssuesSidebarProps {
  selection: IssueNavSelection;
  onSelect: (selection: IssueNavSelection) => void;
  agentRunningCount: number;
  views: ViewSummary[];
  onCreateView: () => void;
  onDeleteView: (viewId: string) => void;
  onRenameView: (title: string) => void;
  onCollapse: () => void;
}

export function IssuesSidebar({
  selection,
  onSelect,
  agentRunningCount,
  views,
  onCreateView,
  onDeleteView,
  onRenameView,
  onCollapse,
}: IssuesSidebarProps) {
  const { t } = useTranslation("issues");
  const presets = usePresetItems();
  const agentSelection: IssueNavSelection = { kind: "agent" };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <SidebarPanelHeader
        title={t("sidebar.nav.title")}
        collapseLabel={t("sidebar.collapse")}
        onCollapse={onCollapse}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {presets.map((item) => {
          const target: IssueNavSelection = {
            kind: "issues",
            preset: item.preset,
          };
          return (
            <IssueNavRow
              key={item.preset}
              icon={item.icon}
              label={item.label}
              isActive={isSameIssueNav(selection, target)}
              onSelect={() => onSelect(target)}
            />
          );
        })}
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
          onCreateView={onCreateView}
          onDeleteView={onDeleteView}
          onRenameView={onRenameView}
        />
      </div>
    </div>
  );
}
