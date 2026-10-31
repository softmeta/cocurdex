import type {
  AgentToolCallRecord,
  AgentToolCallResult,
} from "@cocurdex/shared";

export interface StoredToolCallResult {
  result: AgentToolCallResult;
  resultRef: string | null;
}

export interface ExternalizableToolCallResult {
  rowId: number;
  toolCallId: string;
  updatedAt: string;
  result: AgentToolCallResult;
}

export interface ToolCallRepository {
  list(): Promise<AgentToolCallRecord[]>;
  listBySessionId(sessionId: string): Promise<AgentToolCallRecord[]>;
  // Lighter variant for the chat UI: omits raw_output_json (often large —
  // command output, file contents) so session switches don't pay to load,
  // serialize, and hold detail payloads users may never expand. The returned
  // records have unloaded result fields; fetch them via getResultById.
  listSummariesBySessionId(sessionId: string): Promise<AgentToolCallRecord[]>;
  listSummariesChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<AgentToolCallRecord[]>;
  getResultById(toolCallId: string): Promise<StoredToolCallResult | null>;
  listResultRefsBySessionId(sessionId: string): Promise<Map<string, string>>;
  listResultRefs(): Promise<Set<string>>;
  listExternalizableResults(input: {
    minBytes: number;
    limit: number;
    afterRowId: number;
  }): Promise<ExternalizableToolCallResult[]>;
  externalizeResult(
    toolCallId: string,
    updatedAt: string,
    resultRef: string,
  ): Promise<boolean>;
  upsert(toolCall: AgentToolCallRecord): Promise<number | null>;
  clearBySessionId(sessionId: string): Promise<void>;
  // Daemon-start recovery: a tool call only reaches a terminal status when the
  // agent reports it, so anything still pending/in_progress when the daemon
  // opens the database belongs to a process that died mid-turn (crash, force
  // quit, SIGKILL). Nothing can be running yet at that point, so the sweep is
  // unconditional. Without it those rows render as "running" forever.
  failNonTerminal(): Promise<void>;
}
