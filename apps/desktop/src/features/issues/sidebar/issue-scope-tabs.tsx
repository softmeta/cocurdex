import type { ViewSummary } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { type IssueNavSelection, isNavPreset, navPlace } from "./issue-nav";
import { usePresetItems } from "./use-preset-items";

const VIEW_TAB_PREFIX = "view:";

export function IssueScopeTabs({
  selection,
  pinnedViews,
  onSelect,
}: {
  selection: IssueNavSelection;
  pinnedViews: readonly ViewSummary[];
  onSelect: (selection: IssueNavSelection) => void;
}) {
  const { t } = useTranslation("issues");
  const items = usePresetItems();
  const value =
    selection.kind === "issues"
      ? selection.preset
      : `${VIEW_TAB_PREFIX}${selection.viewId}`;
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (typeof next !== "string") return;
        if (next.startsWith(VIEW_TAB_PREFIX)) {
          onSelect({
            kind: "view",
            viewId: next.slice(VIEW_TAB_PREFIX.length),
          });
        } else if (isNavPreset(next)) {
          onSelect({
            kind: "issues",
            preset: next,
            place: navPlace(selection),
          });
        }
      }}
    >
      <TabsList variant="ghost" aria-label={t("sidebar.nav.scope")}>
        {items.map((item) => (
          <TabsTrigger key={item.preset} value={item.preset}>
            {item.label}
          </TabsTrigger>
        ))}
        {pinnedViews.map((view) => (
          <TabsTrigger key={view.id} value={`${VIEW_TAB_PREFIX}${view.id}`}>
            {view.title || t("sidebar.untitledBoard")}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
