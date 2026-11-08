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
  failNonTerminal(): Promise<void>;
}
