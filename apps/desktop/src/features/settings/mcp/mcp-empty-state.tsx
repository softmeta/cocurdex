import { Download, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState } from "@/components/ui";
import { JsonAddMenu } from "../json-add-menu";
import { JsonDropArea } from "../json-drop-area";
import type { JsonTextHandler } from "../json-file-import";
import type { McpImportAgentSummary } from "./mcp-import-items";
import { useMcpJsonMessages } from "./use-mcp-json-messages";

export function McpEmptyState({
  summary,
  onAddManually,
  onImportAgents,
  onText,
}: {
  summary: McpImportAgentSummary;
  onAddManually(): void;
  onImportAgents(): void;
  onText: JsonTextHandler;
}) {
  const { t, i18n } = useTranslation("settings");
  const jsonMessages = useMcpJsonMessages();
  const canImportAgents = summary.count > 0;
  const agents = new Intl.ListFormat(i18n.language, {
    type: "conjunction",
  }).format(summary.agents.map((agent) => t(`mcp.import.source.${agent}`)));

  return (
    <JsonDropArea
      className="flex-col"
      label={t("mcp.empty.title")}
      messages={jsonMessages}
      onText={onText}
    >
      <EmptyState
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {canImportAgents ? (
              <Button type="button" onClick={onImportAgents}>
                <Download className="size-4" />
                {t("mcp.list.importFromAgents")}
              </Button>
            ) : null}
            <JsonAddMenu
              label={t("mcp.empty.add")}
              messages={jsonMessages}
              variant={canImportAgents ? "outline" : "default"}
              onAddManually={onAddManually}
              onText={onText}
            />
          </div>
        }
        className="flex-1 pb-24"
        description={
          canImportAgents
            ? t("mcp.empty.discovered", { count: summary.count, agents })
            : t("mcp.empty.description")
        }
        icon={<Server />}
        title={t("mcp.empty.title")}
      />
    </JsonDropArea>
  );
}
