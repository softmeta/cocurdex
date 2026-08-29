import type { AgentId, AgentProviderSelection } from "@cocurdex/shared";

export interface AgentProviderDefaultRepository {
  list(): Promise<AgentProviderSelection[]>;
  getByAgentId(agentId: AgentId): Promise<AgentProviderSelection | null>;
  upsert(selection: AgentProviderSelection): Promise<void>;
  delete(agentId: AgentId): Promise<void>;
}
