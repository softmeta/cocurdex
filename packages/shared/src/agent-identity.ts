export type BuiltInAgentId = "claude-agent" | "codex" | "pi" | "opencode";

export const ACP_REGISTRY_AGENT_ID_PREFIX = "acp:";

export type AcpRegistryAgentId = `acp:${string}`;

export type AgentId = BuiltInAgentId | AcpRegistryAgentId;

export function isAcpRegistryAgentId(id: string): id is AcpRegistryAgentId {
  return (
    id.startsWith(ACP_REGISTRY_AGENT_ID_PREFIX) &&
    id.length > ACP_REGISTRY_AGENT_ID_PREFIX.length
  );
}

export const PLAN_USAGE_AGENT_IDS = [
  "claude-agent",
  "codex",
  "acp:grok-build",
] as const satisfies readonly AgentId[];

export type PlanUsageAgentId = (typeof PLAN_USAGE_AGENT_IDS)[number];

export function isPlanUsageAgentId(id: AgentId): id is PlanUsageAgentId {
  return (PLAN_USAGE_AGENT_IDS as readonly AgentId[]).includes(id);
}
