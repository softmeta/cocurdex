import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { hostScopes } from "@/lib";
import { ApplicationsSettingsPanel } from "./apps";
import { McpSettingsPanel } from "./mcp";
import {
  type ConnectionSectionId,
  isConnectionSection,
  permittedConnectionSections,
} from "./settings-sections";
import { SkillsSettingsPanel } from "./skills";

const panels: Record<ConnectionSectionId, ComponentType> = {
  apps: ApplicationsSettingsPanel,
  mcp: McpSettingsPanel,
  skills: SkillsSettingsPanel,
};

export function ConnectionsSettingsPanel({
  section,
  onSectionChange,
}: {
  section: ConnectionSectionId;
  onSectionChange(section: ConnectionSectionId): void;
}) {
  const { t } = useTranslation("settings");
  const tabs = permittedConnectionSections(hostScopes());
  const Panel = panels[section];

  return (
    <Tabs
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
      value={section}
      onValueChange={(value) => {
        if (isConnectionSection(value)) onSectionChange(value);
      }}
    >
      {tabs.length > 1 ? (
        <TabsList className="shrink-0">
          {tabs.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`sections.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      ) : null}
      <TabsContent
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        value={section}
      >
        <Panel />
      </TabsContent>
    </Tabs>
  );
}
