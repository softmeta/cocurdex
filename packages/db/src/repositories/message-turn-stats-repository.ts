import type { AgentTurnCompletedEvent } from "@cocurdex/shared";

export interface MessageTurnStatsRepository {
  listBySessionId(
    sessionId: string,
  ): Promise<Record<string, AgentTurnCompletedEvent>>;
  upsert(event: AgentTurnCompletedEvent): Promise<void>;
}
