import type {
  SessionActivityKind,
  SessionResultDisposition,
} from "@cocurdex/shared";

export interface StoredSessionAttention {
  sessionId: string;
  activityKind: SessionActivityKind;
  connectionPending: boolean;
  latestResultAt: string | null;
  lastVisitedAt: string | null;
  resultDisposition: SessionResultDisposition;
  updatedAt: string;
}

export interface SessionAttentionRepository {
  list(): Promise<StoredSessionAttention[]>;
  getBySessionId(sessionId: string): Promise<StoredSessionAttention | null>;
  upsert(attention: StoredSessionAttention): Promise<void>;
}
