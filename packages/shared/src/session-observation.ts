import type {
  AgentPermissionRequestRecord,
  AgentPlanApprovalRecord,
  AgentQuestionRequestRecord,
  AgentSessionPlan,
  AgentToolCallRecord,
  AgentTurnCompletedEvent,
  AgentUsageRecord,
  MessageRecord,
  QueuedAgentInputRecord,
  RunRecord,
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
  activeRun: RunRecord | null;
  usage: AgentUsageRecord | null;
  turnChangeSets: Record<string, TurnChangeSet>;
  interactions: SessionInteractionSnapshot;
  plan: AgentSessionPlan | null;
}

export interface SessionTranscriptSync {
  complete: boolean;
  messages: MessageRecord[];
  deletedMessageIds: string[];
  activeMessages: MessageRecord[];
  turnStats: Record<string, AgentTurnCompletedEvent>;
  turnChangeSets: Record<string, TurnChangeSet> | null;
  toolCalls: AgentToolCallRecord[];
  plan: AgentSessionPlan | null;
}

export type SyncPullMode = "full" | "delta";

export interface SyncPullInput {
  sessionIds: string[];
  hydratedSessionIds?: string[];
  cursor?: string | null;
}

export interface SyncPullResult {
  mode: SyncPullMode;
  cursor: string;
  epoch: string;
  eventSeq: number;
  sessions: SessionRecord[];
  removedSessionIds: string[];
  queuedAgentInputs: QueuedAgentInputRecord[];
  queuedMessages: MessageRecord[];
  activeRuns: RunRecord[];
  sessionUsage: Record<string, AgentUsageRecord>;
  interactions: SessionInteractionSnapshot;
  transcripts: Record<string, SessionTranscriptSync | null>;
  pausedQueueSessionIds: string[];
}

export type StoredSyncPullResult = Omit<
  SyncPullResult,
  "pausedQueueSessionIds"
>;
