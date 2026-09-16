import type {
  AgentEvent,
  AgentInputDelivery,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  AgentThinkingLevel,
  MessageAttachment,
  MessageRecord,
  SessionRecord,
} from "../contracts";
import type { DaemonEventMeta } from "../data-events";
import type { SessionObservationSnapshot } from "../session-observation";

export type SessionConfiguration = Pick<
  SessionRecord,
  | "id"
  | "workspaceId"
  | "title"
  | "agentType"
  | "writeMode"
  | "collaborationMode"
  | "permissionMode"
  | "agentRoleId"
  | "providerSnapshot"
  | "worktreePath"
>;

export interface SendSessionCommand {
  sessionId: string;
  messageId?: string;
  createdAt?: string;
  content: string;
  attachments?: MessageAttachment[];
  thinkingLevel?: AgentThinkingLevel;
  delivery?: AgentInputDelivery;
}

export type SubmitPreviousMessageCommand = Pick<
  SendSessionCommand,
  "sessionId" | "content" | "attachments"
> & {
  messageId: string;
  revertWorkspace: boolean;
};

export interface TaskApi {
  submitPreviousMessage(
    input: SubmitPreviousMessageCommand,
  ): Promise<MessageRecord>;
  getPreviousMessageCheckpointStatus(
    sessionId: string,
    messageId: string,
  ): Promise<{ available: boolean }>;
  listSessions(): Promise<SessionRecord[]>;
  getSessionSnapshot(
    sessionId: string,
  ): Promise<SessionObservationSnapshot | null>;
  saveSessionConfiguration(input: SessionConfiguration): Promise<SessionRecord>;
  sendMessage(input: SendSessionCommand): Promise<MessageRecord>;
  stopSession(sessionId: string): Promise<void>;
  resolvePermission(
    requestId: string,
    decision: AgentPermissionDecision,
  ): Promise<boolean>;
  resolveQuestion(questionId: string, answer: string): Promise<boolean>;
  resolvePlanApproval(
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ): Promise<boolean>;
  onAgentEvent(
    listener: (event: AgentEvent, meta: DaemonEventMeta) => void,
  ): () => void;
}
