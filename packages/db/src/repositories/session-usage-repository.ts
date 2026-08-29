import type { AgentUsageRecord } from "@cocurdex/shared";

export interface SessionUsageRepository {
  list(): Promise<Record<string, AgentUsageRecord>>;
  add(
    sessionId: string,
    usage: AgentUsageRecord,
    updatedAt: string,
  ): Promise<void>;
}
