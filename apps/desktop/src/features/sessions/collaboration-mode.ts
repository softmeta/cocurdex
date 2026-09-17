/**
 * OpenCode expresses plan vs build through its own agent list, so the generic
 * session mode row would duplicate (and fight with) that axis.
 */
export function usesAgentAxisForCollaboration(agentType: unknown) {
  return agentType === "opencode";
}
