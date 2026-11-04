import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
import type { IssueNavSelection } from "./issue-nav";
import { usePresetItems } from "./use-preset-items";

type ScopeTab = "all" | "active" | "backlog" | "agent";

function activeTab(selection: IssueNavSelection): ScopeTab | null {
  if (selection.kind === "issues") return selection.preset;
  if (selection.kind === "agent") return "agent";
  return null;
}

function tabSelection(tab: ScopeTab): IssueNavSelection {
  if (tab === "agent") return { kind: "agent" };
  return { kind: "issues", preset: tab };
}

export function IssueScopeTabs({
  selection,
  agentRunningCount,
  onSelect,
}: {
  selection: IssueNavSelection;
  agentRunningCount: number;
  onSelect: (selection: IssueNavSelection) => void;
}) {
  const { t } = useTranslation("issues");
  const items = usePresetItems();
  return (
    <Tabs
      value={activeTab(selection)}
      onValueChange={(value) => onSelect(tabSelection(value as ScopeTab))}
    >
      <TabsList aria-label={t("sidebar.nav.scope")}>
        {items.map((item) => (
          <TabsTrigger key={item.preset} value={item.preset}>
            {item.label}
          </TabsTrigger>
        ))}
        <TabsTrigger value="agent">
          {t("sidebar.nav.agent")}
          {agentRunningCount > 0 ? (
            <span className="text-muted-foreground tabular-nums">
              {agentRunningCount}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
