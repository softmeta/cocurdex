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

export const DISABLED_AGENTS_SETTING_KEY = "agent.disabledIds";

export function canDisableAgent(agentId: AgentId): boolean {
  return agentId !== "pi";
}

export function normalizeDisabledAgentIds(value: unknown): AgentId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<AgentId>();
  for (const item of value) {
    if (typeof item === "string" && isAgentId(item) && canDisableAgent(item)) {
      seen.add(item);
    }
  }
  return [...seen];
}

export function parseDisabledAgentIds(
  raw: string | null | undefined,
): Set<AgentId> {
  if (!raw) {
    return new Set();
  }
  try {
    return new Set(normalizeDisabledAgentIds(JSON.parse(raw)));
  } catch {
    return new Set();
  }
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
