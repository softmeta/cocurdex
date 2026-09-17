import type { AgentCapabilities } from "@cocurdex/shared";

export interface AgentCapabilityCacheEntry {
  capabilities: Partial<AgentCapabilities>;
  probedAt: string;
}

export interface AgentCapabilityCacheRepository {
  get(
    agentId: string,
    version: string,
  ): Promise<AgentCapabilityCacheEntry | null>;
  set(
    agentId: string,
    version: string,
    entry: AgentCapabilityCacheEntry,
  ): Promise<void>;
}
