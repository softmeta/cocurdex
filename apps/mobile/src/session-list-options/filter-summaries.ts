import type { SessionListView } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { updateSessionListView, useSessionListLabels } from "@/sessions";
import { useSessionAgentChoices } from "./session-agents";

export function clearSessionFilters() {
  updateSessionListView({
    statuses: [],
    agents: [],
    environments: [],
    sources: [],
  });
}

export function useFilterSummaries(hostId: string, view: SessionListView) {
  const { t } = useTranslation("sessions");
  const labels = useSessionListLabels();
  const agentLabels = new Map(
    useSessionAgentChoices(hostId).map((agent) => [agent.id, agent.label]),
  );
  const summary = (selected: readonly string[]) =>
    selected.length === 0 ? t("list.options.any") : selected.join(", ");
  return {
    statuses: summary(view.statuses.map((status) => labels.status[status])),
    agents: summary(view.agents.map((id) => agentLabels.get(id) ?? id)),
    environments: summary(
      view.environments.map((environment) => labels.environment[environment]),
    ),
  };
}
