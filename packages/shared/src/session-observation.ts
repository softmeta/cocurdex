import type {
  AgentPermissionRequestRecord,
  AgentPlanApprovalRecord,
  AgentQuestionRequestRecord,
  AgentToolCallRecord,
  AgentUsageRecord,
  MessageRecord,
  QueuedAgentInputRecord,
  SessionRecord,
} from "./contracts";
import type { TurnChangeSet } from "./workspace-changes";

export interface SessionInteractionSnapshot {
  permissions: AgentPermissionRequestRecord[];
  questions: AgentQuestionRequestRecord[];
  planApprovals: AgentPlanApprovalRecord[];
}

export interface SessionObservationSnapshot {
  session: SessionRecord;
  messages: MessageRecord[];
  activeMessages: MessageRecord[];
  toolCalls: AgentToolCallRecord[];
  queuedAgentInputs: QueuedAgentInputRecord[];
  usage: AgentUsageRecord | null;
  turnChangeSets: Record<string, TurnChangeSet>;
  interactions: SessionInteractionSnapshot;
}
