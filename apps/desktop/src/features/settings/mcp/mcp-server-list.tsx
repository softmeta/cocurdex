import type { McpServerConfig, McpServerScope } from "@cocurdex/shared";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, DropdownMenuItem, Text } from "@/components/ui";
import { JsonAddMenu } from "../json-add-menu";
import type { JsonTextHandler } from "../json-file-import";
import { SettingsListItem } from "../settings-list-item";
import { SettingsSearchInput } from "../settings-search-input";
import {
  type McpSelection,
  matchesServerQuery,
  serverDotState,
  serverSummary,
} from "./mcp-selection";
import { McpStatusDot } from "./mcp-status-dot";
import { useMcpJsonMessages } from "./use-mcp-json-messages";
import { type McpStatusState, mcpStatusKey } from "./use-mcp-settings";

interface McpServerGroupProps {
  label: string;
  readOnly?: boolean;
  scope: McpServerScope;
  selection: McpSelection | null;
  servers: [string, McpServerConfig][];
  status: McpStatusState;
  onSelect(selection: McpSelection): void;
}

function McpServerGroup({
  label,
  readOnly = false,
  scope,
  selection,
  servers,
  status,
  onSelect,
}: McpServerGroupProps) {
  const { t } = useTranslation("settings");
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <div className="flex h-5 items-center gap-2 px-1">
        <Text size="meta" tone="muted" weight="medium">
          {label}
        </Text>
        {readOnly ? (
          <Badge variant="outline">{t("mcp.list.readOnly")}</Badge>
        ) : null}
      </div>
      {servers.map(([name, config]) => (
        <SettingsListItem
          dataAttributes={{ "data-mcp-server": name, "data-mcp-scope": scope }}
          isActive={selection?.scope === scope && selection.name === name}
          key={name}
          subtitle={serverSummary(config)}
          title={name}
          trailing={
            <McpStatusDot
              state={serverDotState(
                config,
                status.byKey[mcpStatusKey(scope, name)],
              )}
            />
          }
          onClick={() => onSelect({ scope, name })}
        />
      ))}
    </section>
  );
}

export function McpServerList({
  project,
  query,
  selection,
  servers,
  status,
  workspaceName,
  onAdd,
  onImport,
  onQueryChange,
  onSelect,
  onText,
}: {
  project: Record<string, McpServerConfig> | null;
  query: string;
  selection: McpSelection | null;
  servers: Record<string, McpServerConfig>;
  status: McpStatusState;
  workspaceName: string | null;
  onAdd(): void;
  onImport(): void;
  onQueryChange(query: string): void;
  onSelect(selection: McpSelection): void;
  onText: JsonTextHandler;
}) {
  const { t } = useTranslation("settings");
  const jsonMessages = useMcpJsonMessages();
  const globalEntries = Object.entries(servers).filter(([name, config]) =>
    matchesServerQuery(name, config, query),
  );
  const projectEntries = Object.entries(project ?? {}).filter(
    ([name, config]) => matchesServerQuery(name, config, query),
  );
  const isEmpty = globalEntries.length === 0 && projectEntries.length === 0;

  return (
    <div className="flex min-h-0 w-72 shrink-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <SettingsSearchInput
            aria-label={t("mcp.list.search")}
            placeholder={t("mcp.list.search")}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <JsonAddMenu
          extraItems={
            <DropdownMenuItem onClick={onImport}>
              <Download className="size-3.5" />
              {t("mcp.list.importFromAgents")}
            </DropdownMenuItem>
          }
          label={t("mcp.list.add")}
          messages={jsonMessages}
          variant="secondary"
          onAddManually={onAdd}
          onText={onText}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex flex-col gap-4 pe-1">
          {isEmpty && query.trim() ? (
            <Text className="px-1" size="body" tone="muted">
              {t("mcp.list.noMatches")}
            </Text>
          ) : null}
          {globalEntries.length > 0 ? (
            <McpServerGroup
              label={t("mcp.list.global")}
              scope="global"
              selection={selection}
              servers={globalEntries}
              status={status}
              onSelect={onSelect}
            />
          ) : null}
          {projectEntries.length > 0 ? (
            <McpServerGroup
              label={t("mcp.list.project", { workspace: workspaceName ?? "" })}
              readOnly
              scope="project"
              selection={selection}
              servers={projectEntries}
              status={status}
              onSelect={onSelect}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
