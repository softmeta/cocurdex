import type { AgentProviderSessionRecord } from "@cocurdex/shared";

export interface ProviderSessionRepository {
  getBySessionId(sessionId: string): Promise<AgentProviderSessionRecord | null>;
  upsert(record: AgentProviderSessionRecord): Promise<void>;
  clear(sessionId: string): Promise<void>;
}
