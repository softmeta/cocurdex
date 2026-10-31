import {
  type AgentMcpServerRuntime,
  getMcpStatusKind,
  type McpStatusKind,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { FormRow, FormSection, FormSupportingText } from "@/ui";

function useStatusLabels(): Record<Exclude<McpStatusKind, "unknown">, string> {
  const { t } = useTranslation("sessions");
  return {
    connected: t("sessionConfig.mcpStatus.connected"),
    connecting: t("sessionConfig.mcpStatus.connecting"),
    disabled: t("sessionConfig.mcpStatus.disabled"),
    failed: t("sessionConfig.mcpStatus.failed"),
  };
}

export function McpSection({
  servers,
}: {
  servers: readonly AgentMcpServerRuntime[];
}) {
  const { t } = useTranslation("sessions");
  const labels = useStatusLabels();
  return (
    <FormSection
      title={t("sessionConfig.mcp")}
      footer={servers.length === 0 ? t("sessionConfig.mcpNone") : undefined}
    >
      {servers.map((server) => {
        const kind = getMcpStatusKind(server.status);
        return (
          <FormRow
            key={server.name}
            testID={`session-config-mcp-${server.name}`}
            supporting={
              <FormSupportingText
                tone={kind === "failed" ? "destructive" : "muted"}
              >
                {kind === "unknown" ? server.status : labels[kind]}
              </FormSupportingText>
            }
          >
            {server.name}
          </FormRow>
        );
      })}
    </FormSection>
  );
}
