import {
  type AgentId,
  isAgentId,
  supportsInSessionRuntimeAxis,
} from "@cocurdex/shared";

export function usesAgentAxisForCollaboration(agentType: unknown) {
  return (
    typeof agentType === "string" &&
    isAgentId(agentType) &&
    supportsInSessionRuntimeAxis(agentType as AgentId, "agent")
  );
}
