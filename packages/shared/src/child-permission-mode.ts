import { getFallbackAgentPermissionModes } from "./agent-permission-modes";
import { getAgentTraits } from "./agent-traits";
import type {
  AgentId,
  AgentPermissionMode,
  AgentPermissionModeOption,
  AgentPermissionModeRisk,
} from "./contracts";

const RISK_RANK: Record<AgentPermissionModeRisk, number> = {
  normal: 0,
  elevated: 1,
  dangerous: 2,
};

export interface PermissionModeSide {
  agentId: AgentId;
  permissionMode: AgentPermissionMode | null;
  /** The agent's live options; the agent's built-in options are added. */
  options: readonly AgentPermissionModeOption[];
}

export interface ChildPermissionMode {
  permissionMode: AgentPermissionMode | null;
  /** The mode applied when the requested one was riskier than the parent's. */
  limitedTo: AgentPermissionMode | null;
}

function optionsOf(side: PermissionModeSide) {
  const options = [...side.options];
  for (const fallback of getFallbackAgentPermissionModes(side.agentId)) {
    if (!options.some((option) => option.id === fallback.id)) {
      options.push(fallback);
    }
  }
  return options;
}

/** A mode the options do not rank counts as `unknown`. */
function rankOf(
  options: readonly AgentPermissionModeOption[],
  mode: AgentPermissionMode | null,
  unknown: AgentPermissionModeRisk,
) {
  const option = mode
    ? options.find((candidate) => candidate.id === mode)
    : options[0];
  return RISK_RANK[option?.risk ?? unknown];
}

/**
 * The permission mode a child session (a teammate, a script agent) runs with: what its role asks
 * for, lowered to the riskiest mode of the child's agent that does not exceed the parent's risk, so
 * spawning cannot escalate past the session that spawned it. An agent without tool approvals runs
 * every tool unasked, so as a parent it bounds nothing and as a child it cannot be lowered.
 */
export function childPermissionMode(
  parent: PermissionModeSide,
  child: PermissionModeSide,
): ChildPermissionMode {
  const unchanged = { permissionMode: child.permissionMode, limitedTo: null };
  if (!getAgentTraits(child.agentId).toolApprovals) return unchanged;
  if (!getAgentTraits(parent.agentId).toolApprovals) return unchanged;
  const childOptions = optionsOf(child);
  if (childOptions.length === 0) return unchanged;
  const ceiling = rankOf(optionsOf(parent), parent.permissionMode, "normal");
  if (rankOf(childOptions, child.permissionMode, "dangerous") <= ceiling) {
    return unchanged;
  }
  let limitedTo: AgentPermissionModeOption | null = null;
  for (const option of childOptions) {
    const rank = RISK_RANK[option.risk];
    if (rank > ceiling) continue;
    if (!limitedTo || rank > RISK_RANK[limitedTo.risk]) limitedTo = option;
  }
  const applied = limitedTo?.id ?? childOptions[0].id;
  return { permissionMode: applied, limitedTo: applied };
}
