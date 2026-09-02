import type {
  AgentId,
  AgentPermissionDecision,
  AgentPermissionMode,
  AgentPermissionRequestRecord,
  AgentPlanApprovalDecision,
  AgentPlanApprovalRecord,
  AgentProviderSnapshot,
  AgentQuestionRequestRecord,
  AgentSessionMode,
  AgentSlashCommand,
  AgentThinkingLevel,
  CollaborationModeKind,
  MessageAttachment,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { Folder } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { rightPanelResolvedActiveViewAtom } from "@/app/layout/right-editor-panel-store";
import { AppGitBranchLabel } from "@/components";
import { JumpControls } from "@/components/chat";
import {
  ChatComposer,
  type ChatComposerHandle,
  ComposerSurface,
  ComposerSurfaceBody,
  composerFooterControlClassName,
  type ThinkingLevelOption,
} from "@/features/composer";
import { editorPanelOpenAtom } from "@/features/editor";
import { PermissionCard } from "../permission";
import { PlanApprovalCard, PlanPanel, type SessionPlan } from "../plan";
import { QuestionCard } from "../question";
import { type QueuedAgentInputItem, QueuedInputShelf } from "../queued-input";

// Shared with pure chat — re-export so existing agent imports keep working.
export { JumpControls };

interface ChatComposerControls {
  activeBranch?: string | null;
  agentLabel: string;
  agentType?: AgentId;
  attachment?: MessageAttachment;
  draftKey?: string;
  collaborationMode: CollaborationModeKind;
  permissionMode?: AgentPermissionMode | null;
  providerSnapshot?: AgentProviderSnapshot | null;
  thinkingLevel?: AgentThinkingLevel | null;
  thinkingLevelOptions?: ThinkingLevelOption[];
  isRunning: boolean;
  canSendWhileRunning?: boolean;
  runtimeCommands?: AgentSlashCommand[] | null;
  runtimeMode?: {
    availableModes: AgentSessionMode[];
    currentModeId: string;
  } | null;
  pendingPermissionRequest?: AgentPermissionRequestRecord | null;
  pendingPlanApproval?: AgentPlanApprovalRecord | null;
  queuedInputs?: QueuedAgentInputItem[];
  supportsSteering?: boolean;
  /** Live ACP task list (todo_write / plan update) — docked above the composer. */
  plan?: SessionPlan | null;
  workspaceName?: string | null;
  workspaceRootPath?: string | null;
  composerRef?: Ref<ChatComposerHandle>;
  onClearAttachment?(): void;
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
  onStop?(): void;
  onDeleteQueuedInput?(item: QueuedAgentInputItem): Promise<void>;
  onSteerQueuedInput?(item: QueuedAgentInputItem): Promise<void>;
  onUpdateQueuedInput?(
    item: QueuedAgentInputItem,
    content: string,
  ): Promise<void>;
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
  pendingQuestion?: AgentQuestionRequestRecord | null;
  onAnswerQuestion?(
    question: AgentQuestionRequestRecord,
    answer: string,
  ): Promise<void> | void;
  hideComposer?: boolean;
  parentSessionTitle?: string | null;
  onOpenParentSession?(): void;
}

function SessionWorkspaceFooterLabel({
  workspaceName,
}: {
  workspaceName?: string | null;
}) {
  if (!workspaceName) {
    return null;
  }

  return (
    <span
      className={composerFooterControlClassName(
        "flex max-w-40 text-chat-fg-muted",
      )}
      title={workspaceName}
    >
      <Folder className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{workspaceName}</span>
    </span>
  );
}

function SessionBranchFooterLabel({ branch }: { branch?: string | null }) {
  const { t } = useTranslation("editor");
  const setActiveView = useSetAtom(rightPanelResolvedActiveViewAtom);
  const setPanelOpen = useSetAtom(editorPanelOpenAtom);

  if (!branch) {
    return null;
  }

  return (
    <AppGitBranchLabel
      aria-label={t("actions.showGitChanges")}
      branch={branch}
      className={composerFooterControlClassName("max-w-40 text-chat-fg-muted")}
      onClick={() => {
        setPanelOpen(true);
        setActiveView("git");
      }}
    />
  );
}

export function EmptyChatState({
  activeBranch,
  composerRef,
  onAnswerQuestion: _onAnswerQuestion,
  pendingQuestion: _pendingQuestion,
  workspaceName,
  ...composerProps
}: ChatComposerControls) {
  // Workspace leads the footer; branch stays after the agent/runtime controls.
  return (
    <ComposerSurface>
      <ComposerSurfaceBody>
        <ChatComposer
          {...composerProps}
          ref={composerRef}
          variant="panel"
          tone="welcome"
          mentionMenuPlacement="bottom"
          footerLeading={
            <SessionWorkspaceFooterLabel workspaceName={workspaceName} />
          }
          footerTrailing={<SessionBranchFooterLabel branch={activeBranch} />}
        />
      </ComposerSurfaceBody>
    </ComposerSurface>
  );
}

export function ComposerDock({
  activeBranch,
  workspaceName,
  composerRef,
  pendingPermissionRequest,
  pendingPlanApproval,
  queuedInputs = [],
  supportsSteering = false,
  plan = null,
  planCollapsed = false,
  onDismissPlan,
  onTogglePlanCollapsed,
  onResolvePermission,
  onResolvePlanApproval,
  pendingQuestion,
  onAnswerQuestion,
  onDeleteQueuedInput,
  onSteerQueuedInput,
  onUpdateQueuedInput,
  hideComposer = false,
  parentSessionTitle,
  onOpenParentSession,
  ...composerProps
}: ChatComposerControls) {
  const { t } = useTranslation("agent");
  const hasBlockingCard = Boolean(
    pendingPlanApproval || pendingPermissionRequest,
  );

  return (
    <div className="overflow-visible bg-linear-to-t from-chat-canvas via-chat-canvas to-transparent px-2 pb-2 md:px-3 xl:px-6">
      {/* Composer sits slightly wider than the message column so the follow-up
          input has a bit more breathing room while messages stay readable. */}
      <div className="relative mx-auto flex w-full max-w-[780px] flex-col gap-2 overflow-visible">
        {/* The task list floats out of flow above the dock: it appears and
            disappears on its own (every `todo_write`), and taking dock height
            would shove the whole transcript up and down each time. It paints
            over the tail of the transcript instead — opaque surface, and the
            user can collapse or dismiss it. Blocking cards stay in flow: they
            need the reading space and they resolve on user action. */}
        {plan && !hideComposer ? (
          <div className="absolute inset-x-0 bottom-full z-10 mb-2 flex min-w-0 flex-col gap-2">
            <PlanPanel
              collapsed={planCollapsed}
              onDismiss={onDismissPlan}
              onToggleCollapsed={onTogglePlanCollapsed}
              plan={plan}
            />
          </div>
        ) : null}
        {hasBlockingCard ? (
          <div className="flex min-w-0 flex-col gap-2 overflow-visible">
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
          </div>
        ) : null}
        {pendingQuestion ? (
          <QuestionCard
            onAnswer={onAnswerQuestion}
            question={pendingQuestion}
            variant="dock"
          />
        ) : null}
        {queuedInputs.length > 0 &&
        !hideComposer &&
        onDeleteQueuedInput &&
        onSteerQueuedInput &&
        onUpdateQueuedInput ? (
          <QueuedInputShelf
            items={queuedInputs}
            onDelete={onDeleteQueuedInput}
            onSteer={onSteerQueuedInput}
            onUpdate={onUpdateQueuedInput}
            supportsSteering={supportsSteering}
          />
        ) : null}
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
            ref={composerRef}
            variant="pill"
            footerLeading={
              <SessionWorkspaceFooterLabel workspaceName={workspaceName} />
            }
            footerTrailing={<SessionBranchFooterLabel branch={activeBranch} />}
          />
        )}
      </div>
    </div>
  );
}
