import {
  type AgentDescriptor,
  type AgentId,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";
import type { ReactNode } from "react";
import {
  type AdapterStatusKind,
  getAdapterStatus,
  isAdapterSelectable,
} from "./adapter-status";
import { agentOptions } from "./agent-options";
import { getAgentDisplayLabel } from "./session-store";

export interface AgentSelectOption {
  label: ReactNode;
  selectable?: boolean;
  statusKind?: AdapterStatusKind;
  value: AgentId;
}

export function buildAgentSelectOptions(
  agents: readonly AgentDescriptor[],
): AgentSelectOption[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));

  const registryAgentIds = agents
    .map((agent) => agent.id)
    .filter(isAcpRegistryAgentId);
  return [...agentOptions.map((option) => option.id), ...registryAgentIds].map(
    (agentId) => {
      const agent = byId.get(agentId);
      const status = agent ? getAdapterStatus(agent) : null;
      const kind = status?.kind ?? "detecting";

      return {
        value: agentId,
        label: getAgentDisplayLabel(agentId),
        selectable: isAdapterSelectable(kind),
        statusKind: kind,
      };
    },
  );
}
