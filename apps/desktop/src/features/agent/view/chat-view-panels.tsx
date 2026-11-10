import type {
  AgentId,
  AgentPermissionMode,
  AgentPermissionRequestRecord,
  AgentPlanApprovalDecision,
  AgentPlanApprovalRecord,
  AgentProviderSnapshot,
  AgentQuestionRequestRecord,
  AgentRoleRecord,
  AgentSessionMode,
  AgentSlashCommand,
  AgentThinkingLevel,
  MessageAttachment,
  ThinkingLevelOption,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { JumpControls } from "@/components/chat";
import {
  ChatComposer,
  type ChatComposerHandle,
  ComposerDockFrame,
  type ComposerSendOutcome,
} from "@/features/composer";
import { ScriptRunPanel, TeamPanel } from "@/features/sessions";
import { useChatPresentation } from "../chat-display";
import { PermissionCard, permissionsBySessionAtom } from "../permission";
import { PlanApprovalCard, PlanPanel, type SessionPlan } from "../plan";
import { QuestionCard, questionsBySessionAtom } from "../question";
import {
  pausedQueueSessionIdsAtom,
  type QueuedAgentInputItem,
  QueuedInputShelf,
} from "../queued-input";
import type { ChatComposerOverride } from "./chat-view-types";

export { JumpControls };

interface ChatComposerControls {
  chatComposer?: ChatComposerOverride;
  agentLabel: string;
  sessionId?: string;
  agentType?: AgentId;
  attachment?: MessageAttachment;
  composerContextChips?: ReactNode;
  draftKey?: string;
  sessionModeId: string | null;
  permissionMode?: AgentPermissionMode | null;
  providerSnapshot?: AgentProviderSnapshot | null;
  thinkingLevel?: AgentThinkingLevel | null;
  thinkingLevelOptions?: ThinkingLevelOption[];
  isRunning: boolean;
  role?: AgentRoleRecord | null;
  placeholderOverride?: string;
  canSendWhileRunning?: boolean;
  runtimeCommands?: AgentSlashCommand[] | null;
  runtimeMode?: {
    availableModes: AgentSessionMode[];
    currentModeId: string;
  } | null;
  pendingPermissionRequest?: AgentPermissionRequestRecord | null;
  pendingPlanApproval?: AgentPlanApprovalRecord | null;
  queuedInputs?: QueuedAgentInputItem[];
  canSteerQueuedInput?: boolean;
  plan?: SessionPlan | null;
  workspaceRootPath?: string | null;
  workspaceRootPaths?: string[];
  composerRef?: Ref<ChatComposerHandle>;
  onClearAttachment?(): void;
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
  pendingQuestion?: AgentQuestionRequestRecord | null;
  onAnswerQuestion?(
    question: AgentQuestionRequestRecord,
    answer: string,
  ): Promise<void> | void;
  hideComposer?: boolean;
  parentSessionTitle?: string | null;
  onOpenParentSession?(): void;
}

function collectPendingPrompts(
  permissionsBySession: Record<string, AgentPermissionRequestRecord[]>,
  questionsBySession: Record<string, AgentQuestionRequestRecord[]>,
) {
  const prompts: Record<string, string> = {};
  for (const [sessionId, permissions] of Object.entries(permissionsBySession)) {
    const pending = permissions.find((item) => item.status === "pending");
    if (pending) prompts[sessionId] = pending.title;
  }
  for (const [sessionId, questions] of Object.entries(questionsBySession)) {
    const pending = questions.find((item) => item.status === "pending");
    if (pending) prompts[sessionId] = pending.question;
  }
  return prompts;
}

export function ComposerDock({
  chatComposer,
  composerRef,
  isRunning,
  pendingPermissionRequest,
  pendingPlanApproval,
  queuedInputs = [],
  canSteerQueuedInput = false,
  plan = null,
  planCollapsed = false,
  onDismissPlan,
  onTogglePlanCollapsed,
  onResolvePermission,
  onResolvePlanApproval,
  pendingQuestion,
  onAnswerQuestion,
  onDeleteQueuedInput,
  onSendNowQueuedInput,
  onResumeQueuedInputs,
  onSteerQueuedInput,
  onUpdateQueuedInput,
  hideComposer = false,
  parentSessionTitle,
  onOpenParentSession,
  composerContextChips,
  ...composerProps
}: ChatComposerControls) {
  const { t } = useTranslation("agent");
  const presentation = useChatPresentation();
  const permissionsBySession = useAtomValue(permissionsBySessionAtom);
  const questionsBySession = useAtomValue(questionsBySessionAtom);
  const pausedQueueSessionIds = useAtomValue(pausedQueueSessionIdsAtom);
  const queuePaused =
    !isRunning &&
    composerProps.sessionId !== undefined &&
    pausedQueueSessionIds.has(composerProps.sessionId);
  const pendingPromptBySession = collectPendingPrompts(
    permissionsBySession,
    questionsBySession,
  );

  return (
    <ComposerDockFrame className="bg-linear-to-t from-chat-fade via-chat-fade to-transparent">
      <div className="absolute inset-x-0 bottom-full z-10 -mx-1 -mt-1 mb-1 flex max-h-[75dvh] min-w-0 flex-col gap-2 overflow-y-auto overscroll-contain p-1">
        {plan && !hideComposer ? (
          <PlanPanel
            collapsed={planCollapsed}
            isRunning={isRunning}
            onDismiss={onDismissPlan}
            onToggleCollapsed={onTogglePlanCollapsed}
            plan={plan}
          />
        ) : null}
        {composerProps.sessionId && !hideComposer ? (
          <ScriptRunPanel
            key={`script-runs:${composerProps.sessionId}`}
            sessionId={composerProps.sessionId}
          />
        ) : null}
        {composerProps.sessionId && !hideComposer ? (
          <TeamPanel
            key={composerProps.sessionId}
            pendingPromptBySession={pendingPromptBySession}
            sessionId={composerProps.sessionId}
          />
        ) : null}
        {queuedInputs.length > 0 &&
        !hideComposer &&
        onDeleteQueuedInput &&
        onSendNowQueuedInput &&
        onSteerQueuedInput &&
        onUpdateQueuedInput ? (
          <QueuedInputShelf
            isRunning={isRunning}
            items={queuedInputs}
            onDelete={onDeleteQueuedInput}
            onSendNow={onSendNowQueuedInput}
            onResume={queuePaused ? onResumeQueuedInputs : undefined}
            onSteer={onSteerQueuedInput}
            onUpdate={onUpdateQueuedInput}
            canSteerQueuedInput={canSteerQueuedInput && isRunning}
          />
        ) : null}
        {pendingPlanApproval ? (
          <PlanApprovalCard
            approval={pendingPlanApproval}
            onResolve={onResolvePlanApproval}
          />
        ) : null}
        {pendingPermissionRequest ? (
          <PermissionCard
            onResolve={onResolvePermission}
            permission={pendingPermissionRequest}
            variant="dock"
          />
        ) : null}
        {pendingQuestion ? (
          <QuestionCard
            onAnswer={onAnswerQuestion}
            question={pendingQuestion}
            variant="dock"
          />
        ) : null}
      </div>
      {hideComposer ? (
        <div className="flex min-w-0 items-center gap-2 rounded-control border border-chat-border-soft bg-chat-surface-raised px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-meta text-chat-fg-muted">
            {t("toolCalls.subagentReadOnly")}
          </span>
          {onOpenParentSession ? (
            <button
              className="shrink-0 text-meta text-chat-link"
              onClick={onOpenParentSession}
              type="button"
            >
              {parentSessionTitle
                ? t("toolCalls.openParentSessionNamed", {
                    title: parentSessionTitle,
                  })
                : t("toolCalls.openParentSession")}
            </button>
          ) : null}
        </div>
      ) : (
        <ChatComposer
          {...composerProps}
          isRunning={isRunning}
          ref={composerRef}
          runtimeControls={presentation !== "assistant"}
          contextChips={composerContextChips}
          {...(chatComposer
            ? {
                mode: "chat" as const,
                controls: chatComposer.controls,
                footerTrailing: chatComposer.footerTrailing,
              }
            : {})}
        />
      )}
    </ComposerDockFrame>
  );
}
