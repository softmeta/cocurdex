import type { AgentTurnCompletedEvent } from "@cocurdex/shared";
import type { TimelineSeqRange } from "./timeline-repository";

export interface MessageTurnStatsRepository {
  listBySessionId(
    sessionId: string,
  ): Promise<Record<string, AgentTurnCompletedEvent>>;
  listChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<Record<string, AgentTurnCompletedEvent>>;
  listByMessageSeqRange(
    sessionId: string,
    range: TimelineSeqRange,
  ): Promise<Record<string, AgentTurnCompletedEvent>>;
  upsert(event: AgentTurnCompletedEvent): Promise<void>;
}
