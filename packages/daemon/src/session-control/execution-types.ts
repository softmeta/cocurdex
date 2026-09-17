import type {
  MessageRecord,
  SendSessionCommand,
  SessionRecord,
} from "@cocurdex/shared";

export interface SessionExecutionContext {
  session: SessionRecord;
  workspaceRootPath: string;
  workspaceRootPaths?: string[];
}

export type SessionTurnOutcome =
  | { status: "completed"; message: MessageRecord }
  | { status: "cancelled" }
  | { status: "failed"; error: string };

export type SessionRuntimeMessage = SessionExecutionContext &
  Omit<SendSessionCommand, "sessionId">;
