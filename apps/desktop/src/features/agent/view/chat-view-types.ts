import type {
  AgentId,
  AgentPermissionDecision,
  AgentPermissionMode,
  AgentPermissionRequestRecord,
  AgentPlanApprovalDecision,
  AgentPlanApprovalRecord,
  AgentProviderSnapshot,
  AgentQuestionRequestRecord,
  AgentThinkingLevel,
  AgentToolCallRecord,
  CollaborationModeKind,
  MessageAttachment,
  MessageRecord,
  SessionStatus,
} from "@cocurdex/shared";
import type { Ref } from "react";
import type {
  ChatComposerHandle,
  ThinkingLevelOption,
} from "@/features/composer";
import type { SessionPlan } from "../plan";
import type { QueuedAgentInputItem } from "../queued-input";
import type { AgentSessionRuntimeState } from "../runtime";
import type { ToolCallPreviewLocation } from "../tool-call";

export type PreviousMessageRevertPreference = "revert" | "dont-revert";

export type PendingPreviousMessageSubmit = {
  canRevert: boolean;
  content: string;
  message: MessageRecord;
};

export interface ChatViewProps {
  messages: MessageRecord[];
  permissionRequests?: AgentPermissionRequestRecord[];
  questions?: AgentQuestionRequestRecord[];
  // Only the parked approval is threaded down: like a permission request it
  // renders docked above the composer, never inside the scrollable transcript.
  pendingPlanApproval?: AgentPlanApprovalRecord | null;
  toolCalls?: AgentToolCallRecord[];
  // Live ACP task list (todo_write). Docked above the composer with the
  // approval/permission cards — not inlined in the message stream.
  plan?: SessionPlan | null;
  attachment?: MessageAttachment;
  agentLabel?: string;
  agentType?: AgentId;
  collaborationMode?: CollaborationModeKind;
  permissionMode?: AgentPermissionMode | null;
  providerSnapshot?: AgentProviderSnapshot | null;
  thinkingLevel?: AgentThinkingLevel | null;
  thinkingLevelOptions?: ThinkingLevelOption[];
  activeBranch?: string | null;
  workspaceName?: string | null;
  workspaceRootPath?: string | null;
  composerRef?: Ref<ChatComposerHandle>;
  sessionId?: string;
  status?: SessionStatus;
  isRunning?: boolean;
  canSendWhileRunning?: boolean;
  supportsSteering?: boolean;
  runtime?: AgentSessionRuntimeState | null;
  queuedInputs?: QueuedAgentInputItem[];
  onClearAttachment?(): void;
  onAnswerQuestion?(
    question: AgentQuestionRequestRecord,
    answer: string,
  ): Promise<void> | void;
  onSelectCollaborationMode?(mode: CollaborationModeKind): void;
  onSelectPermissionMode?(mode: AgentPermissionMode): void;
  onSelectThinkingLevel?(level: AgentThinkingLevel): void;
  onSelectRuntimeMode?(modeId: string): void;
  onSelectAgent?(agentType: AgentId): void;
  onSend(
    message: string,
    attachments: MessageAttachment[],
    useOppositeFollowUpBehavior?: boolean,
  ): void;
  onSubmitPreviousMessage?(
    message: MessageRecord,
    content: string,
    revertWorkspace: boolean,
  ): Promise<void> | void;
  onCheckPreviousMessageCheckpoint?(
    message: MessageRecord,
  ): Promise<{ available: boolean }> | { available: boolean };
  onStop?(): void;
  onDeleteQueuedInput?(item: QueuedAgentInputItem): Promise<void>;
  onSteerQueuedInput?(item: QueuedAgentInputItem): Promise<void>;
  onUpdateQueuedInput?(
    item: QueuedAgentInputItem,
    content: string,
  ): Promise<void>;
  onOpenToolLocation?(location: ToolCallPreviewLocation): void;
  onResolvePermission?(
    requestId: string,
    decision: AgentPermissionDecision,
  ): Promise<void> | void;
  onResolvePlanApproval?(
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ): Promise<void> | void;
  onDismissPlan?(): void;
  onTogglePlanCollapsed?(): void;
  planCollapsed?: boolean;
  readOnly?: boolean;
  parentSessionTitle?: string | null;
  onOpenParentSession?(): void;
}
