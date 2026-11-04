import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
import type { IssueNavPreset, IssueNavSelection } from "./issue-nav";
import { usePresetItems } from "./use-preset-items";

export function IssueScopeTabs({
  selection,
  onSelect,
}: {
  selection: IssueNavSelection;
  onSelect: (selection: IssueNavSelection) => void;
}) {
  const { t } = useTranslation("issues");
  const items = usePresetItems();
  return (
    <Tabs
      value={selection.kind === "issues" ? selection.preset : null}
      onValueChange={(value) =>
        onSelect({ kind: "issues", preset: value as IssueNavPreset })
      }
    >
      <TabsList aria-label={t("sidebar.nav.scope")}>
        {items.map((item) => (
          <TabsTrigger key={item.preset} value={item.preset}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
