import type {
  AgentPermissionRequestRecord,
  AgentPlanApprovalRecord,
  AgentQuestionRequestRecord,
  AgentToolCallRecord,
  AgentTurnCompletedEvent,
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

export interface SessionTranscriptSnapshot {
  messages: MessageRecord[];
  activeMessages: MessageRecord[];
  turnStats: Record<string, AgentTurnCompletedEvent>;
  turnChangeSets: Record<string, TurnChangeSet>;
  toolCalls: AgentToolCallRecord[];
}

// Authoritative resync payload after an event replay gap. eventSeq is the
// journal position captured atomically before the reads: journaled events at
// or below it are already persisted and reflected in this payload; events
// above it must still be applied by the client.
export interface AppResyncSnapshot {
  epoch: string;
  eventSeq: number;
  sessions: SessionRecord[];
  queuedAgentInputs: QueuedAgentInputRecord[];
  queuedMessages: MessageRecord[];
  sessionUsage: Record<string, AgentUsageRecord>;
  interactions: SessionInteractionSnapshot;
  transcripts: Record<string, SessionTranscriptSnapshot | null>;
}
