import type { AgentId, AgentProviderSessionRecord } from "@cocurdex/shared";

export interface ProviderSessionRepository {
  get(
    sessionId: string,
    agentType: AgentId,
  ): Promise<AgentProviderSessionRecord | null>;
  upsert(agentType: AgentId, record: AgentProviderSessionRecord): Promise<void>;
  clear(sessionId: string, agentType: AgentId): Promise<void>;
  clearSession(sessionId: string): Promise<void>;
}
