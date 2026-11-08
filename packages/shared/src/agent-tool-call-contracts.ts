export interface AgentToolCallLocation {
  path: string;
  line?: number | null;
}

export type AgentToolCallContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "diff";
      path: string;
      oldText?: string | null;
      newText?: string;
      additions?: number;
      deletions?: number;
    }
  | {
      type: "terminal";
      terminalId: string;
    }
  | {
      type: "data";
      value: unknown;
    };

export interface AgentToolCallResult {
  content: AgentToolCallContent[];
  rawOutput: unknown;
}

export interface AgentSubagentReference {
  sessionId: string;
  type: string | null;
  description: string;
}

export interface AgentToolCallRecord {
  id: string;
  sessionId: string;
  title: string;
  kind?: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  subagent?: AgentSubagentReference | null;
  content: AgentToolCallContent[] | undefined;
  rawInput?: unknown;
  rawOutput?: unknown;
  locations: AgentToolCallLocation[];
  startedAt: string;
  updatedAt: string;
  seq?: number;
  runId?: string | null;
}
