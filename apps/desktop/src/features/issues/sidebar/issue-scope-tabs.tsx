import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
import type { IssueNavPreset } from "./issue-nav";
import { usePresetItems } from "./use-preset-items";

export function IssueScopeTabs({
  preset,
  onPresetChange,
}: {
  preset: IssueNavPreset;
  onPresetChange: (preset: IssueNavPreset) => void;
}) {
  const { t } = useTranslation("issues");
  const items = usePresetItems();
  return (
    <Tabs
      value={preset}
      onValueChange={(value) => onPresetChange(value as IssueNavPreset)}
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
