import type {
  AgentId,
  AgentPermissionMode,
  AgentPermissionRequestRecord,
  AgentPlanApprovalDecision,
  AgentPlanApprovalRecord,
  AgentProviderSnapshot,
  AgentQuestionRequestRecord,
  AgentSessionMode,
  AgentSlashCommand,
  AgentThinkingLevel,
  MessageAttachment,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { Folder } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { ScriptRunPanel, TeamPanel } from "@/features/sessions";
import { desktopApi } from "@/lib";
import { PermissionCard, permissionsBySessionAtom } from "../permission";
import { PlanApprovalCard, PlanPanel, type SessionPlan } from "../plan";
import { QuestionCard, questionsBySessionAtom } from "../question";
import { type QueuedAgentInputItem, QueuedInputShelf } from "../queued-input";

// Shared with pure chat — re-export so existing agent imports keep working.
export { JumpControls };

interface ChatComposerControls {
  activeBranch?: string | null;
  agentLabel: string;
  sessionId?: string;
  agentType?: AgentId;
  attachment?: MessageAttachment;
  draftKey?: string;
  sessionModeId: string | null;
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
  ): void;
  onStop?(): void;
  onDeleteQueuedInput?(item: QueuedAgentInputItem): Promise<void>;
  onSendNowQueuedInput?(item: QueuedAgentInputItem): Promise<void>;
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

  if (!branch) {
    return null;
  }

  return (
    <AppGitBranchLabel
      aria-label={t("actions.showGitChanges")}
      branch={branch}
      className={composerFooterControlClassName("max-w-40 text-chat-fg-muted")}
      onClick={() => {
        void desktopApi.chatWindow
          .dispatchIntent({
            surface: "shell",
            intent: { kind: "show-panel", view: "git" },
          })
          .catch((error: unknown) => {
            toast.error(error instanceof Error ? error.message : String(error));
          });
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
  activeBranch,
  workspaceName,
  composerRef,
  isRunning,
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
  onSendNowQueuedInput,
  onSteerQueuedInput,
  onUpdateQueuedInput,
  hideComposer = false,
  parentSessionTitle,
  onOpenParentSession,
  ...composerProps
}: ChatComposerControls) {
  const { t } = useTranslation("agent");
  const permissionsBySession = useAtomValue(permissionsBySessionAtom);
  const questionsBySession = useAtomValue(questionsBySessionAtom);
  const pendingPromptBySession = collectPendingPrompts(
    permissionsBySession,
    questionsBySession,
  );

  return (
    <div className="overflow-visible bg-linear-to-t from-chat-canvas via-chat-canvas to-transparent px-2 pb-2 @lg/chat:px-3 @3xl/chat:px-6">
      {/* Composer sits slightly wider than the message column so the follow-up
          input has a bit more breathing room while messages stay readable. */}
      <div className="relative mx-auto flex w-full max-w-[780px] flex-col gap-2 overflow-visible">
        {/* Every panel above the composer floats out of flow: the task list,
            status panels, queued inputs, and prompt cards appear, expand, and
            resolve on their own, and taking dock height would shove the
            transcript up and down each time. They paint over the tail of the
            transcript on opaque surfaces instead, and the cap keeps a tall
            stack from reaching the window chrome. */}
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
              items={queuedInputs}
              onDelete={onDeleteQueuedInput}
              onSendNow={onSendNowQueuedInput}
              onSteer={onSteerQueuedInput}
              onUpdate={onUpdateQueuedInput}
              supportsSteering={supportsSteering}
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
