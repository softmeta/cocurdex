import type {
  AgentPermissionRequestRecord,
  AgentPlanApprovalRecord,
  AgentQuestionRequestRecord,
  AgentSessionPlan,
  AgentSubagentReference,
  AgentToolCallRecord,
  RunRecord,
  SessionRecord,
} from "./contracts";

export type ExecutionInteraction =
  | { kind: "permission"; record: AgentPermissionRequestRecord }
  | { kind: "question"; record: AgentQuestionRequestRecord }
  | { kind: "planApproval"; record: AgentPlanApprovalRecord };

export type ExecutionSessionSummary = Pick<
  SessionRecord,
  | "id"
  | "title"
  | "agentType"
  | "sessionKind"
  | "status"
  | "parentSessionId"
  | "parentToolCallId"
  | "createdAt"
  | "updatedAt"
>;

export type ExecutionToolCallSummary = Pick<
  AgentToolCallRecord,
  "id" | "title" | "kind" | "status" | "rawInput" | "startedAt" | "updatedAt"
>;

export type ExecutionObservability = "full" | "limited";

export interface ExecutionToolCallNode {
  toolCall: ExecutionToolCallSummary;
  subagent: AgentSubagentReference | null;
  child: ExecutionSessionNode | null;
  observability: ExecutionObservability;
}

export interface ExecutionRunNode {
  run: RunRecord;
  toolCalls: ExecutionToolCallNode[];
  delegated: ExecutionSessionNode[];
  interactions: ExecutionInteraction[];
}

export interface ExecutionSessionNode {
  session: ExecutionSessionSummary;
  runs: ExecutionRunNode[];
  toolCalls: ExecutionToolCallNode[];
  children: ExecutionSessionNode[];
  interactions: ExecutionInteraction[];
  plan: AgentSessionPlan | null;
  truncated: boolean;
}

export interface SessionExecutionTree {
  root: ExecutionSessionNode;
  maxDepth: number;
}
