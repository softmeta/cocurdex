import type {
  AgentId,
  AgentPermissionMode,
  AgentPermissionRequestRecord,
  AgentPlanApprovalDecision,
  AgentPlanApprovalRecord,
  AgentProviderSnapshot,
  AgentQuestionRequestRecord,
  AgentThinkingLevel,
  AgentToolCallRecord,
  MessageAttachment,
  MessageRecord,
  SessionStatus,
  ThinkingLevelOption,
  WorkspaceRecord,
} from "@cocurdex/shared";
import type { ReactNode, Ref } from "react";
import type {
  ChatComposerHandle,
  ComposerSendOutcome,
} from "@/features/composer";
import type { SessionPlan } from "../plan";
import type { QueuedAgentInputItem } from "../queued-input";
import type { AgentSessionRuntimeState } from "../runtime";
import type { ToolCallPreviewLocation } from "../tool-call";

export interface ChatComposerOverride {
  controls: ReactNode;
  footerTrailing?: ReactNode;
}

export interface ChatViewProps {
  chatComposer?: ChatComposerOverride;
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
  composerContextChips?: ReactNode;
  agentLabel?: string;
  agentType?: AgentId;
  sessionModeId?: string | null;
  permissionMode?: AgentPermissionMode | null;
  providerSnapshot?: AgentProviderSnapshot | null;
  thinkingLevel?: AgentThinkingLevel | null;
  thinkingLevelOptions?: ThinkingLevelOption[];
  activeBranch?: string | null;
  workspace?: Pick<WorkspaceRecord, "id" | "name" | "rootPaths"> | null;
  workspaceRootPath?: string | null;
  workspaceRootPaths?: string[];
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
  onSelectSessionMode?(modeId: string): void;
  onSelectPermissionMode?(mode: AgentPermissionMode): void;
  onSelectThinkingLevel?(level: AgentThinkingLevel): void;
  onSelectRuntimeMode?(modeId: string): void;
  onSelectAgent?(agentType: AgentId): void;
  onSend(
    message: string,
    attachments: MessageAttachment[],
    useOppositeFollowUpBehavior?: boolean,
  ): ComposerSendOutcome | Promise<ComposerSendOutcome>;
  onStop?(): void;
  onDeleteQueuedInput?(item: QueuedAgentInputItem): Promise<void>;
  onSendNowQueuedInput?(item: QueuedAgentInputItem): Promise<void>;
  onResumeQueuedInputs?(sessionId: string): Promise<void>;
  onSteerQueuedInput?(item: QueuedAgentInputItem): Promise<void>;
  onUpdateQueuedInput?(
    item: QueuedAgentInputItem,
    content: string,
  ): Promise<void>;
  onOpenToolLocation?(location: ToolCallPreviewLocation): void;
  onResolvePermission?(
    requestId: string,
    optionId: string,
  ): Promise<boolean | undefined> | undefined;
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
