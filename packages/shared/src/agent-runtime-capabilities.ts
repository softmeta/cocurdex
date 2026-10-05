import { getAcpAgentProfile } from "./acp-agent-profiles";
import {
  type AgentId,
  type AgentRuntimeAxis,
  type AgentRuntimeAxisCapabilities,
  type BuiltInAgentId,
  isAcpRegistryAgentId,
} from "./contracts";

const inSession = "in-session" as const;

// This is a transport-level allowlist. Dynamic model catalogs still decide
// whether a particular selected model exposes an axis at runtime.
export const agentRuntimeAxisCapabilities: Readonly<
  Record<BuiltInAgentId, AgentRuntimeAxisCapabilities>
> = {
  "claude-agent": {
    model: inSession,
    thinking: inSession,
    permission: inSession,
    speed: inSession,
  },
  codex: {
    model: inSession,
    thinking: inSession,
    permission: inSession,
    speed: inSession,
  },
  opencode: {
    model: inSession,
    agent: inSession,
    variant: inSession,
    permission: inSession,
  },
  pi: {
    model: inSession,
    thinking: inSession,
  },
};

const acpRegistryAgentRuntimeAxisCapabilities: AgentRuntimeAxisCapabilities = {
  model: inSession,
  thinking: inSession,
  speed: inSession,
};

export function getAgentRuntimeAxisCapabilities(
  agentId: AgentId,
): AgentRuntimeAxisCapabilities {
  return isAcpRegistryAgentId(agentId)
    ? (getAcpAgentProfile(agentId).runtimeAxes ??
        acpRegistryAgentRuntimeAxisCapabilities)
    : agentRuntimeAxisCapabilities[agentId];
}

export function supportsInSessionRuntimeAxis(
  agentId: AgentId,
  axis: AgentRuntimeAxis,
) {
  return getAgentRuntimeAxisCapabilities(agentId)?.[axis] === inSession;
}
