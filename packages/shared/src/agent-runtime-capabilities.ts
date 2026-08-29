import type {
  AgentId,
  AgentRuntimeAxis,
  AgentRuntimeAxisCapabilities,
} from "./contracts";

const inSession = "in-session" as const;

// This is a transport-level allowlist. Dynamic model catalogs still decide
// whether a particular selected model exposes an axis at runtime.
export const agentRuntimeAxisCapabilities: Readonly<
  Record<AgentId, AgentRuntimeAxisCapabilities>
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
  "grok-build": {
    model: inSession,
    thinking: inSession,
    permission: inSession,
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

export function supportsInSessionRuntimeAxis(
  agentId: AgentId,
  axis: AgentRuntimeAxis,
) {
  return agentRuntimeAxisCapabilities[agentId]?.[axis] === inSession;
}
