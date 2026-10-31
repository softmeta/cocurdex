import type { SessionRecord } from "@cocurdex/shared";

export interface SessionRepository {
  list(): Promise<SessionRecord[]>;
  listArchived(): Promise<SessionRecord[]>;
  listChangedSince(changeSeq: number): Promise<SessionRecord[]>;
  restore(sessionId: string): Promise<SessionRecord[]>;
  listByWorkspaceId(workspaceId: string): Promise<SessionRecord[]>;
  getById(sessionId: string): Promise<SessionRecord | null>;
  upsert(session: SessionRecord): Promise<void>;
  allocateTimelineSeq(sessionId: string): Promise<number | null>;
  updateTitle(
    sessionId: string,
    title: string,
    updatedAt?: string,
    expectedTitle?: string | null,
  ): Promise<SessionRecord | null>;
  updateStatus(
    sessionId: string,
    status: SessionRecord["status"],
  ): Promise<void>;
  setPinned(
    sessionId: string,
    pinnedAt: string | null,
  ): Promise<SessionRecord | null>;
  archive(
    sessionId: string,
    archivedAt?: string,
  ): Promise<SessionRecord | null>;
  delete(sessionId: string): Promise<void>;
}
