import type { SendSessionCommand, SessionRecord } from "@cocurdex/shared";

export interface SessionExecutionContext {
  session: SessionRecord;
  workspaceRootPath: string;
  workspaceRootPaths?: string[];
}

export type SessionRuntimeMessage = SessionExecutionContext &
  Omit<SendSessionCommand, "sessionId">;
