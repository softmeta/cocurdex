import {
  type AgentId,
  type AgentPermissionMode,
  type AgentPlanApprovalDecision,
  type AgentProviderSnapshot,
  type AgentQuestionRequestRecord,
  type AgentSessionConfigOption,
  type AgentThinkingLevel,
  type BrowserAnnotation,
  generateLocalSessionTitle,
  getConfigOptionThinkingLevels,
  getThinkingLevelOptions,
  hashLogValue,
  hostForLog,
  isChatSession,
  type MessageAttachment,
  type MessageRecord,
  normalizeWorkspaceRootPaths,
  primaryWorkspaceRootPath,
  resolveSessionWorkingPath,
  resolveThinkingLevel,
  type SessionRecord,
  sessionConfiguration,
  supportsInSessionRuntimeAxis,
  type ThinkingLevelOption,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode, Ref } from "react";
import {
  agentRuntimeBySessionAtom,
  appendMessageAtom,
  appendQueuedInputAtom,
  autoCollapsedPlansBySessionAtom,
  ChatView,
  collapsedPlansBySessionAtom,
  dismissedPlansBySessionAtom,
  dismissPlanForSessionAtom,
  findPendingPlanApproval,
  followUpBehaviorAtom,
  getActiveSessionModeId,
  getAgentInputDelivery,
  messagesLoadedBySessionAtom,
  permissionsBySessionAtom,
  planApprovalsBySessionAtom,
  plansBySessionAtom,
  questionsBySessionAtom,
  queuedInputsBySessionAtom,
  removeQueuedInputAtom,
  selectVisiblePlan,
  togglePlanCollapsedForSessionAtom,
  toolCallsBySessionAtom,
  toolCallsLoadedBySessionAtom,
  useSessionMessages,
} from "@/features/agent";
import { NewChatCard } from "@/features/chat";
import {
  type ChatComposerHandle,
  type ComposerSendOutcome,
  ComposerSurface,
} from "@/features/composer";
import {
  chatComposerAttachmentAtom,
  clearChatComposerAttachmentAtom,
  openFilePreviewAtom,
  remapEditorRootAtom,
  saveEditorViewSnapshotAtom,
} from "@/features/editor";
import { NewSessionCard } from "@/features/new-session";
import {
  activeSessionIdAtom,
  agentsAtom,
  applyRefinedSessionTitleAtom,
  canSwitchSessionAgent,
  createDraftSessionAtom,
  getAgentDisplayLabel,
  getDisplaySessionStatus,
  getSessionPermissionMode,
  isDefaultSessionTitle,
  isSubagentSession,
  lastSelectedAgentAtom,
  markSessionMessageAtom,
  type SessionPaneBinding,
  selectSessionAtom,
  sessionsAtom,
  updateAgentRuntimePreferences,
  updateSessionModeAtom,
  updateSessionPermissionModeAtom,
  updateSessionProviderRuntimeAtom,
  updateSessionStatusAtom,
  updateSessionTitleAtom,
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
import {
  desktopApi,
  logRendererDiagnostic,
  taskApi,
  toAbsolutePath,
} from "@/lib";
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
import { buildBrowserAnnotationAttachments } from "./chat-window/browser-annotation-attachments";
import { BrowserAnnotationChips } from "./chat-window/browser-annotation-chips";
import { withBrowserAnnotations } from "./chat-window/browser-annotation-message";
import {
  chatBrowserAnnotationsAtom,
  consumeBrowserAnnotations,
  useBrowserAnnotationSender,
} from "./chat-window/chat-browser-context";
import { sidebarTabAtom } from "./sidebar/sidebar-tab-store";
import { useQueuedInputActions } from "./use-queued-input-actions";

interface CenterPanelProps {
  composerRef?: Ref<ChatComposerHandle>;
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
  // Sessions persisted before the agent reported effort metadata fall back
  // to the live session config option (Devin's `thought_level`).
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

function summarizeAttachmentForLog(attachment: MessageAttachment) {
  if (attachment.kind === "image") {
    return {
      height: attachment.height,
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      width: attachment.width,
    };
  }

  if (attachment.kind === "context-folder") {
    return {
      kind: attachment.kind,
    };
  }

  if (attachment.kind === "document") {
    return {
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }

  if (attachment.kind === "context-item") {
    return {
      bodyLength: attachment.body.length,
      itemKind: attachment.itemKind,
      kind: attachment.kind,
    };
  }

  return {
    endLine: attachment.endLine,
    kind: attachment.kind ?? "context-file",
    language: attachment.language,
    selectedTextLength: attachment.selectedText.length,
    startLine: attachment.startLine,
    surroundingContextLength: attachment.surroundingContext.length,
  };
}

function summarizeProviderSnapshotForLog(
  snapshot: AgentProviderSnapshot | null | undefined,
) {
  if (!snapshot) {
    return null;
  }

  return {
    api: snapshot.api,
    endpointHost: hostForLog(snapshot.baseUrl),
    modelEndpointHost: hostForLog(snapshot.modelBaseUrl),
    modelId: snapshot.modelId,
    modelName: snapshot.modelName,
    providerId: snapshot.providerId,
    providerName: snapshot.providerName,
    reasoningEffort: snapshot.reasoningEffort ?? null,
    serviceTier: snapshot.serviceTier ?? null,
    thinkingLevel: snapshot.thinkingLevel ?? null,
    supportsReasoning: snapshot.supportsReasoning ?? null,
  };
}

export function CenterPanel({
  composerRef,
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
  const appendMessage = useSetAtom(appendMessageAtom);
  const appendQueuedInput = useSetAtom(appendQueuedInputAtom);
  const removeQueuedInput = useSetAtom(removeQueuedInputAtom);
  const queuedInputActions = useQueuedInputActions();
  const dismissPlanForSession = useSetAtom(dismissPlanForSessionAtom);
  const togglePlanCollapsedForSession = useSetAtom(
    togglePlanCollapsedForSessionAtom,
  );
  const clearChatComposerAttachment = useSetAtom(
    clearChatComposerAttachmentAtom,
  );
  const openFilePreview = useSetAtom(openFilePreviewAtom);
  const createDraftSession = useSetAtom(createDraftSessionAtom);
  const remapEditorRoot = useSetAtom(remapEditorRootAtom);
  const saveEditorViewSnapshot = useSetAtom(saveEditorViewSnapshotAtom);
  const setDraftWorktreePath = useSetAtom(draftWorktreePathAtom);
  const setLastSelectedAgent = useSetAtom(lastSelectedAgentAtom);
  const switchSessionAgent = useSwitchSessionAgent();
  const markSessionMessage = useSetAtom(markSessionMessageAtom);
  const updateSessionMode = useSetAtom(updateSessionModeAtom);
  const updateSessionPermissionMode = useSetAtom(
    updateSessionPermissionModeAtom,
  );
  const updateSessionStatus = useSetAtom(updateSessionStatusAtom);
  const updateSessionTitle = useSetAtom(updateSessionTitleAtom);
  const applyRefinedSessionTitle = useSetAtom(applyRefinedSessionTitleAtom);
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
    if (pane || isChatSession(session)) {
      return true;
    }
    return session.workspaceId === activeWorkspaceId;
  });
  const activeWorkspace = activeSession
    ? workspaces.find((workspace) => workspace.id === activeSession.workspaceId)
    : selectedWorkspace;
  const workingPath =
    activeSession && activeWorkspace
      ? resolveSessionWorkingPath({
          workspaceRootPath: primaryWorkspaceRootPath(activeWorkspace),
          worktreePath: activeSession.worktreePath,
        })
      : globalWorkingPath;
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
  // Agents that own plan mode (Grok Build) switch it off themselves once a plan
  // is approved or abandoned and report the new mode over ACP. Deriving the
  // composer toggle from that report keeps the two from drifting apart; the
  // stored session value is the source of truth only until the agent speaks.
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
  const followUpBehavior = useAtomValue(followUpBehaviorAtom);
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
    if (!activeSession || !activeWorkspace) {
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

  useBrowserAnnotationSender((sent) => {
    void handleSend("", [], false, sent);
  });

  const prepareAutoSessionTitle = (
    session: SessionRecord,
    message: string,
    enabled: boolean,
  ) => {
    if (!enabled) {
      logRendererDiagnostic(
        "debug",
        "[SessionTitle] local generation disabled",
        {
          sessionId: session.id,
        },
      );
      return session;
    }

    const fallbackTitle = session.title;
    const title = generateLocalSessionTitle(message, fallbackTitle);
    logRendererDiagnostic(
      "debug",
      "[SessionTitle] local generation evaluated",
      {
        changed: title !== fallbackTitle,
        messageLength: message.length,
        sessionId: session.id,
      },
    );

    if (title === fallbackTitle) {
      return session;
    }

    const updatedAt = new Date().toISOString();
    const updatedSession = updateSessionTitle({
      sessionId: session.id,
      title,
      expectedTitle: fallbackTitle,
      updatedAt,
    });

    logRendererDiagnostic(
      "debug",
      "[SessionTitle] local title update applied",
      {
        sessionId: session.id,
        updated: Boolean(updatedSession),
      },
    );

    return updatedSession ?? session;
  };

  const refineAutoSessionTitle = (
    session: SessionRecord,
    message: string,
    expectedTitle: string,
  ) => {
    logRendererDiagnostic(
      "debug",
      "[SessionTitle] provider refinement requested",
      {
        messageLength: message.length,
        sessionId: session.id,
      },
    );

    void desktopApi
      .refineSessionTitle({
        sessionId: session.id,
        message,
        fallbackTitle: session.title,
        expectedTitle,
      })
      .then((updatedSession) => {
        logRendererDiagnostic(
          "debug",
          "[SessionTitle] provider refinement completed",
          {
            sessionId: session.id,
            updated: Boolean(
              updatedSession && updatedSession.title !== expectedTitle,
            ),
          },
        );

        if (updatedSession && updatedSession.title !== expectedTitle) {
          applyRefinedSessionTitle({
            expectedTitle,
            refinedSession: updatedSession,
          });
        }
      })
      .catch((error) => {
        logRendererDiagnostic(
          "debug",
          "[SessionTitle] provider refinement failed",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            sessionId: session.id,
          },
        );
      });
  };

  const handleSend = async (
    message: string,
    attachments: MessageAttachment[] = composerAttachment
      ? [composerAttachment]
      : [],
    useOppositeFollowUpBehavior = false,
    sentAnnotations: BrowserAnnotation[] = annotations,
  ): Promise<ComposerSendOutcome> => {
    if (
      !activeSession ||
      !activeWorkspace ||
      isSubagentSession(activeSession)
    ) {
      return "kept";
    }

    const isSteering = activeDisplayStatus === "running";
    const delivery = getAgentInputDelivery({
      behavior: followUpBehavior,
      isRunning: isSteering,
      supportsSteering: activeAgentSupportsSteering,
      useOppositeBehavior: useOppositeFollowUpBehavior,
    });

    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    logRendererDiagnostic("info", "[AgentSession] send start", {
      requestId,
      agentType: activeSession.agentType,
      sessionId: activeSession.id,
      workspaceHash: hashLogValue(
        workingPath ?? primaryWorkspaceRootPath(activeWorkspace),
      ),
      contentLength: message.length,
      attachmentCount: attachments.length,
    });

    let optimisticQueuedMessageId: string | null = null;
    try {
      const nextSession = prepareAutoSessionTitle(
        activeSession,
        message,
        activeMessages.length === 0 &&
          isDefaultSessionTitle(activeSession.title, activeSession.agentType),
      );
      const userMessage: MessageRecord = {
        id: crypto.randomUUID(),
        sessionId: nextSession.id,
        role: "user",
        content: withBrowserAnnotations(message, sentAnnotations),
        attachments,
        createdAt: new Date().toISOString(),
      };
      const isQueuedFollowUp = delivery === "queue-after-run";
      const queuedInputBase = {
        sessionId: nextSession.id,
        workspaceRootPath:
          workingPath ?? primaryWorkspaceRootPath(activeWorkspace),
        thinkingLevel: selectedThinkingLevel ?? undefined,
      };

      if (isQueuedFollowUp) {
        optimisticQueuedMessageId = userMessage.id;
        appendQueuedInput({
          ...queuedInputBase,
          messageId: userMessage.id,
          createdAt: userMessage.createdAt,
          message: userMessage,
        });
      } else {
        updateSessionStatus({ sessionId: nextSession.id, status: "running" });
        appendMessage(userMessage);
      }
      markSessionMessage({
        sessionId: nextSession.id,
        createdAt: userMessage.createdAt,
      });
      clearChatComposerAttachment();
      consumeBrowserAnnotations(sentAnnotations);

      const annotationAttachments =
        await buildBrowserAnnotationAttachments(sentAnnotations);
      const nextAttachments = [...attachments, ...annotationAttachments];
      logRendererDiagnostic("info", "[AgentSession] send payload", {
        attachments: nextAttachments.map(summarizeAttachmentForLog),
        sessionModeId: nextSession.sessionModeId,
        contentLength: userMessage.content.length,
        createdAt: userMessage.createdAt,
        messageId: userMessage.id,
        permissionMode: nextSession.permissionMode ?? null,
        providerSnapshot: summarizeProviderSnapshotForLog(
          nextSession.providerSnapshot,
        ),
        session: {
          agentType: nextSession.agentType,
          id: nextSession.id,
          workspaceId: nextSession.workspaceId,
        },
        thinkingLevel:
          thinkingLevelOptions.length > 0 ? selectedThinkingLevel : undefined,
        workspaceHash: hashLogValue(
          workingPath ?? primaryWorkspaceRootPath(activeWorkspace),
        ),
      });
      if (nextSession.title !== activeSession.title) {
        await desktopApi.updateSessionTitle({
          sessionId: nextSession.id,
          title: nextSession.title,
          expectedTitle: activeSession.title,
        });
      }
      const savedMessage = await taskApi.sendMessage({
        sessionId: nextSession.id,
        messageId: userMessage.id,
        createdAt: userMessage.createdAt,
        content: userMessage.content,
        attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
        thinkingLevel: selectedThinkingLevel ?? undefined,
        delivery,
      });

      if (isQueuedFollowUp) {
        appendQueuedInput({
          ...queuedInputBase,
          messageId: savedMessage.id,
          createdAt: savedMessage.createdAt,
          message: savedMessage,
        });
      }

      logRendererDiagnostic("info", "[AgentSession] send completed", {
        requestId,
        sessionId: nextSession.id,
        messageId: userMessage.id,
        durationMs: Math.round(performance.now() - startedAt),
      });

      // Refine the title only after sendMessage has persisted the session:
      // agent sessions are created lazily on first send, so firing the
      // refineSessionTitle IPC earlier races ahead of the DB row and the main
      // process skips it (missing session / title mismatch). By now the DB
      // holds nextSession.title (the local fallback), which is the expected
      // title the refine handler validates against.
      if (
        !isQueuedFollowUp &&
        !activeAgentUsesNativeSessionTitles &&
        nextSession.title !== activeSession.title
      ) {
        refineAutoSessionTitle(nextSession, message, nextSession.title);
      }
    } catch (error) {
      if (optimisticQueuedMessageId) {
        removeQueuedInput({
          sessionId: activeSession.id,
          messageId: optimisticQueuedMessageId,
        });
      } else {
        updateSessionStatus({ sessionId: activeSession.id, status: "error" });
      }
      console.error("[AgentSession] send failed", {
        requestId,
        sessionId: activeSession.id,
        durationMs: Math.round(performance.now() - startedAt),
      });
      appendMessage({
        id: crypto.randomUUID(),
        sessionId: activeSession.id,
        role: "system",
        content:
          error instanceof Error
            ? error.message
            : "Unknown agent runtime error",
        attachments: [],
        createdAt: new Date().toISOString(),
      });
    }
    return "sent";
  };

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

  const handleStartSession = async ({
    agentType,
    sessionModeId,
    permissionMode,
    attachments,
    message,
    providerSnapshot,
    thinkingLevel,
    agentRoleId,
    teamTemplateId,
    worktreePath,
  }: {
    agentType: AgentId;
    sessionModeId: string | null;
    permissionMode?: AgentPermissionMode | null;
    attachments?: MessageAttachment[];
    message: string;
    providerSnapshot?: AgentProviderSnapshot | null;
    thinkingLevel?: AgentThinkingLevel;
    agentRoleId?: string | null;
    teamTemplateId?: string | null;
    worktreePath?: string;
  }): Promise<ComposerSendOutcome> => {
    const workspace = activeWorkspace ?? (await openWorkspaceFromDialog());
    if (!workspace) return "kept";

    const session = createDraftSession({
      workspaceId: workspace.id,
      agentType,
      sessionModeId,
      permissionMode,
      agentRoleId: agentRoleId ?? null,
      providerSnapshot: providerSnapshot ?? null,
      worktreePath: worktreePath ?? draftWorktreePath,
    });
    setDraftWorktreePath(null);
    // Carry the tabs the user was viewing during the draft into the new
    // session so switching to it does not blank the editor. openFiles still
    // reflects the pre-draft view because the draft (null session) no longer
    // clears it (see restoreEditorViewForSession).
    saveEditorViewSnapshot(session.id);
    const titledSession = prepareAutoSessionTitle(session, message, true);
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();

    logRendererDiagnostic("info", "[AgentSession] start session send", {
      requestId,
      agentType,
      sessionId: titledSession.id,
      workspaceHash: hashLogValue(
        workingPath ?? primaryWorkspaceRootPath(workspace),
      ),
      contentLength: message.length,
      attachmentCount: attachments?.length ?? 0,
    });

    try {
      const initialAttachments = attachments ?? [];
      const userMessage: MessageRecord = {
        id: crypto.randomUUID(),
        sessionId: titledSession.id,
        role: "user",
        content: withBrowserAnnotations(message, annotations),
        attachments: initialAttachments,
        createdAt: new Date().toISOString(),
      };

      updateSessionStatus({ sessionId: titledSession.id, status: "running" });
      appendMessage(userMessage);
      markSessionMessage({
        sessionId: titledSession.id,
        createdAt: userMessage.createdAt,
      });
      clearChatComposerAttachment();
      consumeBrowserAnnotations(annotations);

      await taskApi.saveSessionConfiguration(
        sessionConfiguration(titledSession),
      );
      if (teamTemplateId) {
        await desktopApi.createTeam({
          leadSessionId: titledSession.id,
          templateId: teamTemplateId,
        });
      }

      const annotationAttachments =
        await buildBrowserAnnotationAttachments(annotations);
      const nextAttachments = [...initialAttachments, ...annotationAttachments];
      logRendererDiagnostic(
        "info",
        "[AgentSession] start session send payload",
        {
          attachments: nextAttachments.map(summarizeAttachmentForLog),
          sessionModeId: titledSession.sessionModeId,
          contentLength: userMessage.content.length,
          createdAt: userMessage.createdAt,
          messageId: userMessage.id,
          permissionMode: titledSession.permissionMode ?? null,
          providerSnapshot: summarizeProviderSnapshotForLog(
            titledSession.providerSnapshot,
          ),
          session: {
            agentType: titledSession.agentType,
            id: titledSession.id,
            workspaceId: titledSession.workspaceId,
          },
          thinkingLevel,
          workspaceHash: hashLogValue(
            workingPath ?? primaryWorkspaceRootPath(workspace),
          ),
        },
      );
      await taskApi.sendMessage({
        sessionId: titledSession.id,
        messageId: userMessage.id,
        createdAt: userMessage.createdAt,
        content: userMessage.content,
        attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
        thinkingLevel,
      });

      if (titledSession.title !== session.title) {
        refineAutoSessionTitle(titledSession, message, titledSession.title);
      }

      logRendererDiagnostic(
        "info",
        "[AgentSession] start session send completed",
        {
          requestId,
          sessionId: titledSession.id,
          messageId: userMessage.id,
          durationMs: Math.round(performance.now() - startedAt),
        },
      );
    } catch (error) {
      updateSessionStatus({ sessionId: titledSession.id, status: "error" });
      console.error("[AgentSession] start session send failed", {
        requestId,
        sessionId: titledSession.id,
        durationMs: Math.round(performance.now() - startedAt),
      });
      appendMessage({
        id: crypto.randomUUID(),
        sessionId: titledSession.id,
        role: "system",
        content:
          error instanceof Error
            ? error.message
            : "Unknown agent runtime error",
        attachments: [],
        createdAt: new Date().toISOString(),
      });
    }
    return "sent";
  };

  const persistSession = (session: SessionRecord) => {
    if (!activeWorkspace) {
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

    // A live agent owns its own mode, and the stored value would only reach it
    // on the next prompt. Push the switch now so it also applies mid-turn;
    // agents without runtime modes keep picking it up from the session record.
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
      <ComposerSurface>
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
      </ComposerSurface>
    );
  } else if (centerSurface === "new-chat") {
    newSessionSurface = (
      <ComposerSurface>
        <NewChatCard onStartChat={chatSessionActions.start} />
      </ComposerSurface>
    );
  }

  return (
    <section className="flex h-full flex-col bg-chat-canvas">
      {hideTitlebarSpacer ? null : (
        <div className="shrink-0" style={{ height: TITLEBAR_HEIGHT }} />
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {centerSurface === "agent-session" && activeSession ? (
          <ChatView
            // Tie ChatView's identity to the session. Its scroll position,
            // "initial bottom settled" gate and other session-scoped state
            // should not bleed across switches — reusing the instance caused
            // a flash where the previous session's scrollTop was applied to
            // the new content before the layout effect pulled it to bottom.
            key={activeSession.id}
            activeBranch={activeBranch}
            workspace={activeWorkspace}
            agentLabel={getAgentDisplayLabel(activeSession.agentType)}
            agentType={activeSession.agentType}
            attachment={
              isFocused ? (composerAttachment ?? undefined) : undefined
            }
            composerContextChips={annotationChips}
            sessionModeId={activeSessionModeId}
            composerRef={composerRef}
            permissionMode={activePermissionMode}
            providerSnapshot={activeSession.providerSnapshot}
            thinkingLevel={selectedThinkingLevel}
            thinkingLevelOptions={thinkingLevelOptions}
            isRunning={activeDisplayStatus === "running"}
            canSendWhileRunning
            supportsSteering={activeAgentSupportsSteering}
            messages={activeMessages}
            queuedInputs={activeQueuedInputs}
            // Pass stable Jotai/IPC functions directly. Wrapping them in
            // fresh inline arrows would allocate a new ref every render and
            // propagate through ChatView's children for no behavioral gain.
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
