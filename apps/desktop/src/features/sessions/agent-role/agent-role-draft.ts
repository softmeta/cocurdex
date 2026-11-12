import {
  type AgentDescriptor,
  DEFAULT_AGENT_ID,
  type SaveAgentRolePayload,
} from "@cocurdex/shared";
import { buildAgentSelectOptions } from "../agent-select-options";
import { getDefaultPermissionMode } from "../session-agent-state";

export function blankRoleDraft(
  agents: AgentDescriptor[],
): SaveAgentRolePayload {
  const agentId =
    buildAgentSelectOptions(agents).find(
      (option) => option.selectable !== false,
    )?.value ?? DEFAULT_AGENT_ID;
  return {
    name: "",
    agentId,
    providerId: null,
    modelId: null,
    modelName: null,
    permissionMode: getDefaultPermissionMode(agents, agentId),
    sessionModeId: null,
    reasoningEffort: null,
    serviceTier: null,
    fastMode: null,
    thinkingLevel: null,
    openCodeAgent: null,
    openCodeVariant: null,
  };
}
