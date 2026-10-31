import {
  type AgentId,
  type McpConfigFile,
  type McpServerConfig,
  mcpServerAgents,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { useAtomValue } from "jotai";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "@/components";
import { Label, Switch, Text } from "@/components/ui";
import {
  AgentIcon,
  agentsAtom,
  buildAgentSelectOptions,
  getAgentDisplayLabel,
} from "@/features/sessions";
import { desktopApi } from "@/lib";
import {
  type McpAgentAccess,
  type McpAgentAccessMode,
  type McpAgentRow,
  mcpAgentRows,
  toggleMcpAgent,
} from "./mcp-agent-rows";
import { useMcpInjectionQuery } from "./mcp-queries";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function accessModeDescription(
  t: TFunction<"settings">,
  mode: McpAgentAccessMode,
) {
  return t(`mcp.agents.access.${mode}`);
}

function accessDescription(t: TFunction<"settings">, access: McpAgentAccess) {
  if (access.kind === "serverUnsupported") {
    return t(`mcp.agents.serverUnsupported.${access.reason}`);
  }
  return accessModeDescription(t, access.kind);
}

function McpAgentRowItem({
  row,
  onToggle,
}: {
  row: McpAgentRow;
  onToggle(agentId: AgentId, enabled: boolean): void;
}) {
  const { t } = useTranslation("settings");
  const switchId = useId();
  const descriptionId = useId();
  const description = accessDescription(t, row.access);
  return (
    <div
      className="flex items-center justify-between gap-6 py-3"
      data-mcp-agent={row.agentId}
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <Label className="flex items-center gap-2" htmlFor={switchId}>
          <AgentIcon agentId={row.agentId} />
          <Text size="body" weight="medium">
            {getAgentDisplayLabel(row.agentId)}
          </Text>
        </Label>
        <Text id={descriptionId} size="meta" tone="muted">
          {description}
        </Text>
      </div>
      <Switch
        aria-describedby={descriptionId}
        checked={row.checked}
        disabled={!row.toggleable}
        id={switchId}
        onCheckedChange={(enabled) => onToggle(row.agentId, enabled)}
      />
    </div>
  );
}

export function McpAgentsSection({
  config,
  name,
  onSaved,
}: {
  config: McpServerConfig;
  name: string;
  onSaved(file: McpConfigFile): void;
}) {
  const { t } = useTranslation("settings");
  const agents = useAtomValue(agentsAtom);
  const injection = useMcpInjectionQuery();
  const [pending, setPending] = useState<AgentId[] | null>(null);
  const [error, setError] = useState("");
  const assigned = pending ?? mcpServerAgents(config);
  const available = buildAgentSelectOptions(agents).map(
    (option) => option.value,
  );
  const rows = mcpAgentRows(
    available,
    assigned,
    injection.data?.[name] ?? null,
  );

  const toggle = async (agentId: AgentId, enabled: boolean) => {
    const next = toggleMcpAgent(assigned, agentId, enabled);
    setPending(next);
    setError("");
    try {
      onSaved(await desktopApi.setMcpServerAgents(name, next));
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setPending(null);
    }
  };

  return (
    <section aria-label={t("mcp.agents.title")} data-mcp-agents={name}>
      <SettingsGroup
        description={t("mcp.agents.description")}
        title={t("mcp.agents.title")}
      >
        {rows.map((row) => (
          <McpAgentRowItem
            key={row.agentId}
            row={row}
            onToggle={(agentId, enabled) => void toggle(agentId, enabled)}
          />
        ))}
        {error ? (
          <Text className="py-3" role="alert" size="meta" tone="destructive">
            {error}
          </Text>
        ) : null}
      </SettingsGroup>
    </section>
  );
}
