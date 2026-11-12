import { canDisableAgent } from "./agent-traits";
import { type AgentId, isAgentId } from "./contracts";

export const DISABLED_AGENTS_SETTING_KEY = "agent.disabledIds";

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
