import type { TurnChangeSet } from "@cocurdex/shared";
import type { TimelineSeqRange } from "./timeline-repository";

export interface TurnChangeSetRepository {
  listBySessionId(sessionId: string): Promise<Record<string, TurnChangeSet>>;
  listByUserMessageSeqRange(
    sessionId: string,
    range: TimelineSeqRange,
  ): Promise<Record<string, TurnChangeSet>>;
  listChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<Record<string, TurnChangeSet>>;
  getByMessageId(
    sessionId: string,
    messageId: string,
  ): Promise<TurnChangeSet | null>;
  getByUserMessageId(
    sessionId: string,
    userMessageId: string,
  ): Promise<TurnChangeSet | null>;
  getById(id: string): Promise<TurnChangeSet | null>;
  listAll(): Promise<TurnChangeSet[]>;
  upsert(changeSet: TurnChangeSet): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteBySessionId(sessionId: string): Promise<void>;
}
