export const BUILT_IN_AGENT_IDS = [
  "claude-agent",
  "codex",
  "opencode",
  "pi",
] as const;

export type BuiltInAgentId = (typeof BUILT_IN_AGENT_IDS)[number];

export const DEFAULT_AGENT_ID: BuiltInAgentId = "pi";

export const ACP_REGISTRY_AGENT_ID_PREFIX = "acp:";

export type AcpRegistryAgentId = `acp:${string}`;

export type AgentId = BuiltInAgentId | AcpRegistryAgentId;

export function isAcpRegistryAgentId(id: string): id is AcpRegistryAgentId {
  return (
    id.startsWith(ACP_REGISTRY_AGENT_ID_PREFIX) &&
    id.length > ACP_REGISTRY_AGENT_ID_PREFIX.length
  );
}

export function isAgentId(value: string): value is AgentId {
  return (
    (BUILT_IN_AGENT_IDS as readonly string[]).includes(value) ||
    isAcpRegistryAgentId(value)
  );
}
