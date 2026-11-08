import {
  type AgentId,
  type AgentPermissionMode,
  type AgentPlanApprovalDecision,
  type AgentProviderSnapshot,
  type AgentQuestionRequestRecord,
  type AgentSessionConfigOption,
  type AgentThinkingLevel,
  getConfigOptionThinkingLevels,
  getThinkingLevelOptions,
  isChatSession,
  isPersonalSession,
  normalizeWorkspaceRootPaths,
  primaryWorkspaceRootPath,
  resolveSessionWorkingPath,
  resolveThinkingLevel,
  type SessionRecord,
  sessionConfiguration,
  supportsInSessionRuntimeAxis,
  type ThinkingLevelOption,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode, Ref } from "react";
import {
  agentRuntimeBySessionAtom,
  autoCollapsedPlansBySessionAtom,
  ChatView,
  collapsedPlansBySessionAtom,
  dismissedPlansBySessionAtom,
  dismissPlanForSessionAtom,
  findPendingPlanApproval,
  followUpBehaviorAtom,
  getActiveSessionModeId,
  messagesLoadedBySessionAtom,
  permissionsBySessionAtom,
  planApprovalsBySessionAtom,
  plansBySessionAtom,
  questionsBySessionAtom,
  queuedInputsBySessionAtom,
  selectVisiblePlan,
  togglePlanCollapsedForSessionAtom,
  toolCallsBySessionAtom,
  toolCallsLoadedBySessionAtom,
  useSessionMessages,
} from "@/features/agent";
import { NewChatCard } from "@/features/chat";
import type { ChatComposerHandle } from "@/features/composer";
import {
  chatComposerAttachmentAtom,
  clearChatComposerAttachmentAtom,
  openFilePreviewAtom,
  remapEditorRootAtom,
} from "@/features/editor";
import { NewSessionCard } from "@/features/new-session";
import {
  activeSessionIdAtom,
  agentsAtom,
  canSwitchSessionAgent,
  getAgentDisplayLabel,
  getDisplaySessionStatus,
  getSessionPermissionMode,
  isSubagentSession,
  lastSelectedAgentAtom,
  type SessionPaneBinding,
  selectSessionAtom,
  sessionsAtom,
  updateAgentRuntimePreferences,
  updateSessionModeAtom,
  updateSessionPermissionModeAtom,
  updateSessionProviderRuntimeAtom,
  updateSessionStatusAtom,
  useSwitchSessionAgent,
} from "@/features/sessions";
import {
  activeWorkingPathAtom,
  activeWorkspaceIdAtom,
  activeWorktreesAtom,
  draftWorktreePathAtom,
  openWorkspaceByPathAtom,
  pickHostDirectoryAtom,
  relocateWorkspaceAtom,
  selectWorkspaceAtom,
  workspacesAtom,
} from "@/features/workspaces";
import { desktopApi, taskApi, toAbsolutePath } from "@/lib";
import { TITLEBAR_HEIGHT } from "./app-shell/app-shell-layout";
import {
  useActiveSessionTranscript,
  useGitBranches,
  useGitWorktrees,
  useSessionSwitchMetrics,
} from "./center-panel-data";
import { resolveCenterPanelSurface } from "./center-panel-surface";
import { ChatSessionPanel } from "./chat-session/chat-session-panel";
import { useChatSessionActions } from "./chat-session/use-chat-session-actions";
import { BrowserAnnotationChips } from "./chat-window/browser-annotation-chips";
import { chatBrowserAnnotationsAtom } from "./chat-window/chat-browser-context";
import { PersonalEmptyState } from "./personal-empty-state";
import { sidebarTabAtom } from "./sidebar/sidebar-tab-store";
import { useCenterSessionSend } from "./use-center-session-send";
import { usePersonalSessionView } from "./use-personal-session-view";
import { useQueuedInputActions } from "./use-queued-input-actions";

interface CenterPanelProps {
  composerRef?: Ref<ChatComposerHandle>;
  floatingHeader?: boolean;
  hideTitlebarSpacer?: boolean;
  pane?: SessionPaneBinding;
  isFocused?: boolean;
}

function getSessionThinkingLevelOptions(
  agentType: AgentId,
  snapshot: AgentProviderSnapshot | null | undefined,
  configOptions: readonly AgentSessionConfigOption[] | null,
): ThinkingLevelOption[] {
  const options = getThinkingLevelOptions({
    agentType,
    supportsReasoning: snapshot?.supportsReasoning,
    thinkingLevelMapJson: snapshot?.modelThinkingLevelMapJson,
    supportedReasoningEfforts: snapshot?.supportedReasoningEfforts,
    defaultReasoningEffort: snapshot?.modelDefaultReasoningEffort ?? null,
  });
  if (!supportsInSessionRuntimeAxis(agentType, "thinking")) {
    return options;
  }
  const liveLevels = getConfigOptionThinkingLevels(configOptions);
  if (options.length === 0) {
    return liveLevels;
  }
  if (options.some((option) => option.isDefault)) {
    return options;
  }
  const liveDefault = liveLevels.find((level) => level.isDefault)?.level;
  if (!liveDefault) {
    return options;
  }
  return options.map((option) => ({
    ...option,
    isDefault: option.level === liveDefault,
  }));
}

function resolveCenterWorkingPath(
  session: SessionRecord | undefined,
  workspace: WorkspaceRecord | undefined,
  globalWorkingPath: string | null,
) {
  if (session && isPersonalSession(session)) return null;
  if (!(session && workspace)) return globalWorkingPath;
  return resolveSessionWorkingPath({
    workspaceRootPath: primaryWorkspaceRootPath(workspace),
    worktreePath: session.worktreePath,
  });
}

export function CenterPanel({
  composerRef,
  floatingHeader = false,
  hideTitlebarSpacer,
  pane,
  isFocused = true,
}: CenterPanelProps) {
  const workspaces = useAtomValue(workspacesAtom);
  const sidebarTab = useAtomValue(sidebarTabAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const sessions = useAtomValue(sessionsAtom);
  const atomSessionId = useAtomValue(activeSessionIdAtom);
  const activeSessionId = pane ? pane.sessionId : atomSessionId;
  const chatSessionActions = useChatSessionActions(pane?.id);
  const agents = useAtomValue(agentsAtom);
  const lastSelectedAgent = useAtomValue(lastSelectedAgentAtom);
  const messagesLoadedBySession = useAtomValue(messagesLoadedBySessionAtom);
  const permissionsBySession = useAtomValue(permissionsBySessionAtom);
  const planApprovalsBySession = useAtomValue(planApprovalsBySessionAtom);
  const plansBySession = useAtomValue(plansBySessionAtom);
  const dismissedPlansBySession = useAtomValue(dismissedPlansBySessionAtom);
  const collapsedPlansBySession = useAtomValue(collapsedPlansBySessionAtom);
  const autoCollapsedPlansBySession = useAtomValue(
    autoCollapsedPlansBySessionAtom,
  );
  const questionsBySession = useAtomValue(questionsBySessionAtom);
  const toolCallsBySession = useAtomValue(toolCallsBySessionAtom);
  const toolCallsLoadedBySession = useAtomValue(toolCallsLoadedBySessionAtom);
  const agentRuntimeBySession = useAtomValue(agentRuntimeBySessionAtom);
  const queuedInputsBySession = useAtomValue(queuedInputsBySessionAtom);
  const composerAttachment = useAtomValue(chatComposerAttachmentAtom);
  const queuedInputActions = useQueuedInputActions();
  const dismissPlanForSession = useSetAtom(dismissPlanForSessionAtom);
  const togglePlanCollapsedForSession = useSetAtom(
    togglePlanCollapsedForSessionAtom,
  );
  const clearChatComposerAttachment = useSetAtom(
    clearChatComposerAttachmentAtom,
  );
  const openFilePreview = useSetAtom(openFilePreviewAtom);
  const remapEditorRoot = useSetAtom(remapEditorRootAtom);
  const setDraftWorktreePath = useSetAtom(draftWorktreePathAtom);
  const setLastSelectedAgent = useSetAtom(lastSelectedAgentAtom);
  const switchSessionAgent = useSwitchSessionAgent();
  const updateSessionMode = useSetAtom(updateSessionModeAtom);
  const updateSessionPermissionMode = useSetAtom(
    updateSessionPermissionModeAtom,
  );
  const updateSessionStatus = useSetAtom(updateSessionStatusAtom);
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const openWorkspaceByPath = useSetAtom(openWorkspaceByPathAtom);
  const pickHostDirectory = useSetAtom(pickHostDirectoryAtom);
  const relocateWorkspace = useSetAtom(relocateWorkspaceAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const activeWorktrees = useAtomValue(activeWorktreesAtom);
  const draftWorktreePath = useAtomValue(draftWorktreePathAtom);
  const globalWorkingPath = useAtomValue(activeWorkingPathAtom);
  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const activeSession = sessions.find((session) => {
    if (session.id !== activeSessionId) {
      return false;
    }
    if (pane || isChatSession(session) || isPersonalSession(session)) {
      return true;
    }
    return session.workspaceId === activeWorkspaceId;
  });
  const activeWorkspace = activeSession
    ? workspaces.find((workspace) => workspace.id === activeSession.workspaceId)
    : selectedWorkspace;
  const personalView = usePersonalSessionView(activeSession, composerRef);
  const workingPath = resolveCenterWorkingPath(
    activeSession,
    activeWorkspace,
    globalWorkingPath,
  );
  const sessionRootPath =
    workingPath ??
    (activeWorkspace ? primaryWorkspaceRootPath(activeWorkspace) : null);
  const canDriveActiveSession = Boolean(
    activeSession && (activeWorkspace || isPersonalSession(activeSession)),
  );
  const composerWorkspaceRootPaths = normalizeWorkspaceRootPaths([
    ...(activeWorkspace?.rootPaths ?? []),
    ...(workingPath ? [workingPath] : []),
  ]);
  const activeQueuedInputs = activeSession
    ? (queuedInputsBySession[activeSession.id] ?? [])
    : [];
  const activeQueuedMessageIds = new Set(
    activeQueuedInputs.map((input) => input.messageId),
  );
  const sessionMessages = useSessionMessages(activeSession?.id ?? null);
  let activeMessages = sessionMessages;
  if (activeQueuedMessageIds.size > 0) {
    activeMessages = sessionMessages.filter(
      (message) => !activeQueuedMessageIds.has(message.id),
    );
  }
  const activeToolCalls = activeSession
    ? (toolCallsBySession[activeSession.id] ?? [])
    : [];
  const activePermissions = activeSession
    ? (permissionsBySession[activeSession.id] ?? [])
    : [];
  const activeQuestions = activeSession
    ? (questionsBySession[activeSession.id] ?? [])
    : [];
  const activePendingPlanApproval = activeSession
    ? findPendingPlanApproval(planApprovalsBySession[activeSession.id])
    : null;
  const activePlan = activeSession
    ? selectVisiblePlan(
        plansBySession[activeSession.id],
        Boolean(dismissedPlansBySession[activeSession.id]),
      )
    : null;
  const isActivePlanCollapsed = activeSession
    ? Boolean(
        collapsedPlansBySession[activeSession.id] ||
          autoCollapsedPlansBySession[activeSession.id],
      )
    : false;
  const activeAgentRuntime = activeSession
    ? (agentRuntimeBySession[activeSession.id] ?? null)
    : null;
  const activeSessionModeId = getActiveSessionModeId(
    activeSession,
    activeAgentRuntime,
  );
  const activeSessionDataLoaded = activeSession
    ? Boolean(
        messagesLoadedBySession[activeSession.id] &&
          toolCallsLoadedBySession[activeSession.id],
      )
    : false;
  const activeDisplayStatus = activeSession
    ? getDisplaySessionStatus(activeSession.status, activeMessages)
    : undefined;
  const activeAgentSupportsSteering = Boolean(
    activeSession &&
      agents.find((agent) => agent.id === activeSession.agentType)?.capabilities
        .supportsSteering,
  );
  const activeAgentUsesNativeSessionTitles = Boolean(
    activeSession &&
      agents.find((agent) => agent.id === activeSession.agentType)?.capabilities
        .sessionTitleStrategy === "native",
  );
  const activePermissionMode = activeSession
    ? getSessionPermissionMode(agents, activeSession)
    : null;
  const updateSessionProviderRuntime = useSetAtom(
    updateSessionProviderRuntimeAtom,
  );
  const thinkingLevelOptions = activeSession
    ? getSessionThinkingLevelOptions(
        activeSession.agentType,
        activeSession.providerSnapshot,
        activeAgentRuntime?.configOptions ?? null,
      )
    : [];
  const selectedThinkingLevel = resolveThinkingLevel(
    thinkingLevelOptions,
    activeSession?.providerSnapshot?.thinkingLevel ?? "default",
  );
  const selectThinkingLevel = (thinkingLevel: AgentThinkingLevel) => {
    if (!(activeSession && canDriveActiveSession)) {
      return;
    }
    const updatedSession = updateSessionProviderRuntime({
      sessionId: activeSession.id,
      thinkingLevel: thinkingLevel === "default" ? null : thinkingLevel,
    });
    if (updatedSession) {
      updateAgentRuntimePreferences(activeSession.agentType, {
        thinkingLevel: thinkingLevel === "default" ? null : thinkingLevel,
      });
      void taskApi.saveSessionConfiguration(
        sessionConfiguration(updatedSession),
      );
    }
  };
  const annotations = useAtomValue(chatBrowserAnnotationsAtom);
  const followUpBehavior = useAtomValue(followUpBehaviorAtom);

  useSessionSwitchMetrics(
    activeSession,
    activeSessionDataLoaded,
    activeMessages.length,
    activeToolCalls.length,
  );
  useActiveSessionTranscript(
    activeSession,
    activeMessages.length,
    activeToolCalls,
  );
  const { activeBranches, activeBranch } = useGitBranches(
    workingPath ?? undefined,
  );
  useGitWorktrees(activeWorkspace?.rootPaths[0]);

  const handleStop = async () => {
    if (!activeSession || isSubagentSession(activeSession)) {
      return;
    }

    updateSessionStatus({ sessionId: activeSession.id, status: "idle" });
    await taskApi.stopSession(activeSession.id);
  };

  const openToolLocation = (
    location: Parameters<typeof openFilePreview>[0],
  ) => {
    const filePath = toAbsolutePath(location.filePath, workingPath);
    if (filePath) {
      openFilePreview({ ...location, filePath });
    }
  };

  const handleAnswerQuestion = async (
    question: AgentQuestionRequestRecord,
    answer: string,
  ) => {
    await taskApi.resolveQuestion(question.id, answer);
  };

  const handleResolvePlanApproval = async (
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ) => {
    await taskApi.resolvePlanApproval(approvalId, decision);
  };

  const openWorkspaceFromDialog = async () => {
    const rootPath = await pickHostDirectory();
    if (!rootPath) return null;
    const { workspace, didSwitchWorkspace } = openWorkspaceByPath(rootPath);
    if (didSwitchWorkspace) {
      selectSession(null);
    }
    return workspace;
  };

  const { handleSend, handleStartSession } = useCenterSessionSend({
    activeSession,
    activeWorkspace,
    activeDisplayStatus,
    activeAgentSupportsSteering,
    activeAgentUsesNativeSessionTitles,
    followUpBehavior,
    canDriveActiveSession,
    hasMessages: activeMessages.length > 0,
    hasThinkingOptions: thinkingLevelOptions.length > 0,
    selectedThinkingLevel,
    composerAttachment,
    annotations,
    sessionRootPath,
    workingPath,
    draftWorktreePath,
    openWorkspaceFromDialog,
  });

  const handleOpenWorkspace = async () => {
    await openWorkspaceFromDialog();
  };

  const handleRelocateWorkspace = async (workspaceId: string) => {
    const rootPath = await pickHostDirectory();
    if (!rootPath) return;
    try {
      await relocateWorkspace(workspaceId, rootPath);
    } catch (error) {
      console.error("[Workspaces] relocate failed", error);
      return;
    }
    selectSession(null);
  };

  const handleSelectBranch = async (branch: string) => {
    if (!activeWorkspace || branch === activeBranch) {
      return;
    }

    await desktopApi.checkoutGitBranch(
      workingPath ?? primaryWorkspaceRootPath(activeWorkspace),
      branch,
    );
  };

  const handleSelectWorktree = (path: string | null) => {
    const nextPath = path ?? activeWorkspace?.rootPaths[0] ?? null;
    const currentPath = workingPath ?? activeWorkspace?.rootPaths[0] ?? null;
    if (currentPath && nextPath && currentPath !== nextPath) {
      remapEditorRoot({ fromRoot: currentPath, toRoot: nextPath });
    }
    setDraftWorktreePath(path);
  };

  const handleCreateWorktree = async () => {
    if (!activeWorkspace) {
      throw new Error("No workspace is open.");
    }
    const created = await desktopApi.addGitWorktree({
      repoRootPath: primaryWorkspaceRootPath(activeWorkspace),
      workspaceId: activeWorkspace.id,
    });
    handleSelectWorktree(created.path);
    return created.path;
  };

  const persistSession = (session: SessionRecord) => {
    if (!canDriveActiveSession) {
      return;
    }

    void taskApi.saveSessionConfiguration(sessionConfiguration(session));
  };

  const handleSelectSessionMode = (modeId: string, sessionId: string) => {
    const updatedSession = updateSessionMode({
      sessionId,
      sessionModeId: modeId || null,
    });

    if (updatedSession) {
      persistSession(updatedSession);
    }

    const runtimeModes = agentRuntimeBySession[sessionId]?.mode;
    if (
      modeId &&
      runtimeModes?.availableModes.some(({ id }) => id === modeId)
    ) {
      void desktopApi.setSessionRuntimeMode(sessionId, modeId);
    }
  };

  const handleSelectPermissionMode = (
    mode: AgentPermissionMode,
    sessionId: string,
  ) => {
    const updatedSession = updateSessionPermissionMode({
      sessionId,
      permissionMode: mode,
    });

    if (updatedSession) {
      const agentType = sessions.find(
        (session) => session.id === sessionId,
      )?.agentType;
      if (agentType) {
        updateAgentRuntimePreferences(agentType, {
          permissionMode: mode,
        });
      }
      persistSession(updatedSession);
    }
  };

  const centerSurface = resolveCenterPanelSurface({
    sidebarTab,
    sessionId: activeSessionId,
    session: activeSession ?? null,
    sessionDataLoaded: activeSessionDataLoaded,
  });

  if (centerSurface === "chat-session" && activeSession) {
    return (
      <section className="flex h-full flex-col bg-chat-canvas">
        {hideTitlebarSpacer ? null : (
          <div className="shrink-0" style={{ height: TITLEBAR_HEIGHT }} />
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatSessionPanel
            composerRef={composerRef}
            paneId={pane?.id}
            session={activeSession}
          />
        </div>
      </section>
    );
  }

  const annotationChips =
    annotations.length > 0 ? (
      <BrowserAnnotationChips annotations={annotations} />
    ) : undefined;

  let newSessionSurface: ReactNode = null;
  if (centerSurface === "new-session") {
    newSessionSurface = (
      <NewSessionCard
        activeBranch={activeBranch}
        activeBranches={activeBranches}
        activeWorkspaceId={activeWorkspaceId}
        agents={agents}
        agentType={lastSelectedAgent}
        attachment={isFocused ? (composerAttachment ?? undefined) : undefined}
        composerContextChips={annotationChips}
        sessionModeId={null}
        composerRef={composerRef}
        onClearAttachment={clearChatComposerAttachment}
        onOpenWorkspace={handleOpenWorkspace}
        onRelocateWorkspace={(workspaceId) =>
          void handleRelocateWorkspace(workspaceId)
        }
        onSelectBranch={handleSelectBranch}
        onSelectWorktree={handleSelectWorktree}
        onCreateWorktree={handleCreateWorktree}
        onSelectAgent={setLastSelectedAgent}
        onSelectWorkspace={selectWorkspace}
        onStartSession={handleStartSession}
        worktrees={activeWorktrees}
        selectedWorktreePath={draftWorktreePath}
        sessionTitle={undefined}
        workspaces={workspaces}
        workspaceRootPath={workingPath ?? activeWorkspace?.rootPaths[0]}
        workspaceName={activeWorkspace?.name}
      />
    );
  } else if (centerSurface === "personal-empty") {
    newSessionSurface = (
      <PersonalEmptyState selectedSessionId={activeSessionId ?? null} />
    );
  } else if (centerSurface === "new-chat") {
    newSessionSurface = <NewChatCard onStartChat={chatSessionActions.start} />;
  }

  return (
    <section
      className="flex h-full flex-col bg-chat-canvas"
      data-persona-hue={
        centerSurface === "agent-session" ? personalView?.hue : undefined
      }
    >
      {hideTitlebarSpacer ? null : (
        <div className="shrink-0" style={{ height: TITLEBAR_HEIGHT }} />
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {centerSurface === "agent-session" && activeSession ? (
          <ChatView
            key={activeSession.id}
            agentLabel={getAgentDisplayLabel(activeSession.agentType)}
            agentType={activeSession.agentType}
            attachment={
              isFocused ? (composerAttachment ?? undefined) : undefined
            }
            composerContextChips={annotationChips}
            sessionModeId={activeSessionModeId}
            composerRef={personalView?.composerRef ?? composerRef}
            composerRole={personalView?.composerRole}
            composerPlaceholder={personalView?.composerPlaceholder}
            emptyState={personalView?.emptyState}
            emptyStateAlign={personalView?.emptyStateAlign}
            floatingHeader={floatingHeader && personalView !== null}
            presentation={personalView ? "assistant" : "work"}
            permissionMode={activePermissionMode}
            providerSnapshot={activeSession.providerSnapshot}
            thinkingLevel={selectedThinkingLevel}
            thinkingLevelOptions={thinkingLevelOptions}
            isRunning={activeDisplayStatus === "running"}
            canSendWhileRunning
            canSteerQueuedInput={
              activeAgentSupportsSteering && followUpBehavior === "steer"
            }
            messages={activeMessages}
            queuedInputs={activeQueuedInputs}
            onClearAttachment={clearChatComposerAttachment}
            onAnswerQuestion={handleAnswerQuestion}
            onOpenToolLocation={openToolLocation}
            onResolvePermission={async (requestId, optionId) => {
              return taskApi.resolvePermission(requestId, optionId);
            }}
            onSelectSessionMode={(modeId) =>
              handleSelectSessionMode(modeId, activeSession.id)
            }
            onSelectPermissionMode={
              activeDisplayStatus !== "running"
                ? (mode) => handleSelectPermissionMode(mode, activeSession.id)
                : undefined
            }
            onSelectThinkingLevel={selectThinkingLevel}
            onSelectRuntimeMode={(modeId) => {
              void desktopApi.setSessionRuntimeMode(activeSession.id, modeId);
            }}
            onSelectAgent={
              canSwitchSessionAgent(activeSession, activeDisplayStatus)
                ? (agentType) =>
                    void switchSessionAgent(activeSession.id, agentType)
                : undefined
            }
            onSend={handleSend}
            {...queuedInputActions}
            onStop={handleStop}
            onResolvePlanApproval={handleResolvePlanApproval}
            onDismissPlan={() => {
              dismissPlanForSession(activeSession.id);
            }}
            onTogglePlanCollapsed={() => {
              togglePlanCollapsedForSession(activeSession.id);
            }}
            pendingPlanApproval={activePendingPlanApproval}
            plan={activePlan}
            planCollapsed={isActivePlanCollapsed}
            questions={activeQuestions}
            runtime={activeAgentRuntime}
            sessionId={activeSession.id}
            status={activeSession.status}
            permissionRequests={activePermissions}
            toolCalls={activeToolCalls}
            workspaceRootPath={workingPath ?? activeWorkspace?.rootPaths[0]}
            workspaceRootPaths={composerWorkspaceRootPaths}
            readOnly={isSubagentSession(activeSession)}
            parentSessionTitle={
              activeSession.parentSessionId
                ? (sessions.find(
                    (session) => session.id === activeSession.parentSessionId,
                  )?.title ?? null)
                : null
            }
            onOpenParentSession={
              activeSession.parentSessionId
                ? () => {
                    const parentId = activeSession.parentSessionId;
                    if (parentId) {
                      selectSession(parentId);
                    }
                  }
                : undefined
            }
          />
        ) : (
          newSessionSurface
        )}
      </div>
    </section>
  );
}
