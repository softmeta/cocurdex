import type { AgentId } from "@cocurdex/shared";
import { agentCollaborationModes } from "./session-store";

export function supportsPlanMode(agentType: unknown) {
  return (
    agentCollaborationModes[agentType as AgentId]?.includes("plan") ?? false
  );
}

/**
 * OpenCode expresses plan vs build through its own agent list, so the generic
 * collaboration row would duplicate (and fight with) that axis.
 */
export function usesAgentAxisForCollaboration(agentType: unknown) {
  return agentType === "opencode";
}
