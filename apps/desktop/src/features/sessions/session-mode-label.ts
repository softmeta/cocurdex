import type { AgentId, AgentSessionMode } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";

// Mode ids come from the agent, so the key cannot be a literal. Known ids get
// curated copy; anything else falls back to the name the agent reported.
export function useSessionModeLabels() {
  const { t } = useTranslation("sessions");

  const label = (agentType: AgentId, mode: AgentSessionMode) =>
    t(`sessionMode.${agentType}.${mode.id}` as never, {
      defaultValue: mode.name,
    });

  const description = (agentType: AgentId, mode: AgentSessionMode) =>
    t(`sessionMode.descriptions.${agentType}.${mode.id}` as never, {
      defaultValue: mode.description ?? "",
    }) || null;

  return { description, label };
}
