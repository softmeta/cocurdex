import type { AgentDescriptor, AgentId } from "@cocurdex/shared";
import type { ReactNode } from "react";
import {
  type AdapterStatusKind,
  getAdapterStatus,
  isAdapterSelectable,
} from "./adapter-status";
import { agentOptions } from "./new-session-card/new-session-card-config";
import { agentLabels } from "./session-store";

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

  return agentOptions.map((option) => {
    const agent = byId.get(option.id);
    const status = agent ? getAdapterStatus(agent) : null;
    const kind = status?.kind ?? "detecting";

    return {
      value: option.id,
      label: agentLabels[option.id],
      selectable: isAdapterSelectable(kind),
      statusKind: kind,
    };
  });
}
