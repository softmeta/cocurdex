import {
  type AgentId,
  type AgentSessionMode,
  getAcpRegistryId,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";

export function useSessionModeLabels() {
  const { t } = useTranslation("sessions");

  const keyOf = (agentType: AgentId) =>
    getAcpRegistryId(agentType) ?? agentType;

  const label = (agentType: AgentId, mode: AgentSessionMode) =>
    t(`sessionMode.${keyOf(agentType)}.${mode.id}` as never, {
      defaultValue: mode.name,
    });

  const description = (agentType: AgentId, mode: AgentSessionMode) =>
    t(`sessionMode.descriptions.${keyOf(agentType)}.${mode.id}` as never, {
      defaultValue: mode.description ?? "",
    }) || null;

  return { description, label };
}
