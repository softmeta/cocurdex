import type { SessionRecord } from "@cocurdex/shared";

export interface SessionRepository {
  list(): Promise<SessionRecord[]>;
  listByWorkspaceId(workspaceId: string): Promise<SessionRecord[]>;
  getById(sessionId: string): Promise<SessionRecord | null>;
  upsert(session: SessionRecord): Promise<void>;
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
  archive(
    sessionId: string,
    archivedAt?: string,
  ): Promise<SessionRecord | null>;
  delete(sessionId: string): Promise<void>;
  normalizeRunningToIdle(): Promise<void>;
}
