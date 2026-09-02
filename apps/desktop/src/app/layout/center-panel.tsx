import type {
  AgentId,
  AgentPermissionMode,
  AgentPlanApprovalDecision,
  AgentProviderSnapshot,
  AgentQuestionRequestRecord,
  AgentThinkingLevel,
  BrowserAnnotation,
  CollaborationModeKind,
  MessageAttachment,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode, Ref } from "react";
import {
  agentRuntimeBySessionAtom,
  appendMessageAtom,
  appendQueuedInputAtom,
  ChatView,
  clearPermissionsForSessionAtom,
  clearPlanApprovalsForSessionAtom,
  clearPlanForSessionAtom,
  clearQuestionsForSessionAtom,
  clearToolCallsForSessionAtom,
  collapsedPlansBySessionAtom,
  dismissedPlansBySessionAtom,
  dismissPlanForSessionAtom,
  findPendingPlanApproval,
  followUpBehaviorAtom,
  getActiveCollaborationMode,
  getAgentInputDelivery,
  messagesBySessionAtom,
  messagesLoadedBySessionAtom,
  permissionsBySessionAtom,
  planApprovalsBySessionAtom,
  plansBySessionAtom,
  type QueuedAgentInputItem,
  questionsBySessionAtom,
  queuedInputsBySessionAtom,
  removeQueuedInputAtom,
  rewindMessagesAtom,
  selectVisiblePlan,
  togglePlanCollapsedForSessionAtom,
  toolCallsBySessionAtom,
  toolCallsLoadedBySessionAtom,
  updateQueuedInputAtom,
} from "@/features/agent";
import { annotationsAtom } from "@/features/browser";
import {
  activeConversationIdAtom,
  appendConversationMessageAtom,
  ConversationDetail,
  conversationsAtom,
  NewConversationCard,
  rehydrateChatImages,
  type StartConversationPayload,
  upsertConversationAtom,
} from "@/features/chat";
import {
  type ChatComposerHandle,
  ComposerSurface,
  getThinkingLevelOptions,
  importImageDataUrl,
  resolveThinkingLevel,
  type ThinkingLevelOption,
} from "@/features/composer";
import {
  chatComposerAttachmentAtom,
  clearChatComposerAttachmentAtom,
  openFilePreviewAtom,
  saveEditorViewSnapshotAtom,
} from "@/features/editor";
import {
  activeSessionIdAtom,
  agentLabels,
  agentsAtom,
  applyRefinedSessionTitleAtom,
  createDraftSessionAtom,
  generateLocalSessionTitle,
  getDisplaySessionStatus,
  getSessionPermissionMode,
  isDefaultSessionTitle,
  isSubagentSession,
  lastSelectedAgentAtom,
  markSessionMessageAtom,
  NewSessionCard,
  selectSessionAtom,
  sessionsAtom,
  updateAgentRuntimePreferences,
  updateSessionCollaborationModeAtom,
  updateSessionPermissionModeAtom,
  updateSessionProviderRuntimeAtom,
  updateSessionStatusAtom,
  updateSessionTitleAtom,
} from "@/features/sessions";
import {
  activeBranchAtom,
  activeBranchesAtom,
  activeWorkspaceIdAtom,
  openWorkspaceByPathAtom,
  selectWorkspaceAtom,
  workspacesAtom,
} from "@/features/workspaces";
import { desktopApi, logRendererDiagnostic } from "@/lib";
import { TITLEBAR_HEIGHT } from "./app-shell/app-shell-layout";
import {
  useActiveSessionTranscript,
  useGitBranches,
  useSessionSwitchMetrics,
} from "./center-panel-data";
import { sidebarTabAtom } from "./sidebar/sidebar-tab-store";

interface CenterPanelProps {
  composerRef?: Ref<ChatComposerHandle>;
  // Spacer matches TITLEBAR_HEIGHT so content clears the OS titlebar. The
  // floating chat dock has its own header and sits away from the titlebar, so
  // it drops the spacer to avoid a dead gap.
  hideTitlebarSpacer?: boolean;
}

function getSessionThinkingLevelOptions(
  agentType: AgentId,
  snapshot: AgentProviderSnapshot | null | undefined,
): ThinkingLevelOption[] {
  return getThinkingLevelOptions({
    agentType,
    supportsReasoning: snapshot?.supportsReasoning,
    thinkingLevelMapJson: snapshot?.modelThinkingLevelMapJson,
    supportedReasoningEfforts: snapshot?.supportedReasoningEfforts,
    defaultReasoningEffort: snapshot?.modelDefaultReasoningEffort ?? null,
  });
}

function summarizeAttachmentForLog(attachment: MessageAttachment) {
  if (attachment.kind === "image") {
    return {
      filePath: attachment.filePath,
      height: attachment.height,
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      name: attachment.name,
      sizeBytes: attachment.sizeBytes,
      width: attachment.width,
    };
  }

  if (attachment.kind === "context-folder") {
    return {
      folderPath: attachment.folderPath,
      kind: attachment.kind,
    };
  }

  if (attachment.kind === "document") {
    return {
      filePath: attachment.filePath,
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      name: attachment.name,
      sizeBytes: attachment.sizeBytes,
    };
  }

  return {
    endLine: attachment.endLine,
    filePath: attachment.filePath,
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
    baseUrl: snapshot.baseUrl,
    modelBaseUrl: snapshot.modelBaseUrl ?? null,
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
}: CenterPanelProps) {
  const workspaces = useAtomValue(workspacesAtom);
  const sidebarTab = useAtomValue(sidebarTabAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const sessions = useAtomValue(sessionsAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  // Pure chat conversations share this panel with agent sessions — when an
  // active conversation is selected we hide the agent view entirely.
  const activeConversationId = useAtomValue(activeConversationIdAtom);
  const setActiveConversationId = useSetAtom(activeConversationIdAtom);
  const upsertConversation = useSetAtom(upsertConversationAtom);
  const appendConversationMessage = useSetAtom(appendConversationMessageAtom);
  const conversations = useAtomValue(conversationsAtom);
  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;
  const agents = useAtomValue(agentsAtom);
  const lastSelectedAgent = useAtomValue(lastSelectedAgentAtom);
  const messagesBySession = useAtomValue(messagesBySessionAtom);
  const messagesLoadedBySession = useAtomValue(messagesLoadedBySessionAtom);
  const permissionsBySession = useAtomValue(permissionsBySessionAtom);
  const planApprovalsBySession = useAtomValue(planApprovalsBySessionAtom);
  const plansBySession = useAtomValue(plansBySessionAtom);
  const dismissedPlansBySession = useAtomValue(dismissedPlansBySessionAtom);
  const collapsedPlansBySession = useAtomValue(collapsedPlansBySessionAtom);
  const questionsBySession = useAtomValue(questionsBySessionAtom);
  const toolCallsBySession = useAtomValue(toolCallsBySessionAtom);
  const toolCallsLoadedBySession = useAtomValue(toolCallsLoadedBySessionAtom);
  const agentRuntimeBySession = useAtomValue(agentRuntimeBySessionAtom);
  const queuedInputsBySession = useAtomValue(queuedInputsBySessionAtom);
  const composerAttachment = useAtomValue(chatComposerAttachmentAtom);
  const appendMessage = useSetAtom(appendMessageAtom);
  const appendQueuedInput = useSetAtom(appendQueuedInputAtom);
  const updateQueuedInput = useSetAtom(updateQueuedInputAtom);
  const removeQueuedInput = useSetAtom(removeQueuedInputAtom);
  const rewindMessages = useSetAtom(rewindMessagesAtom);
  const clearToolCallsForSession = useSetAtom(clearToolCallsForSessionAtom);
  const clearPermissionsForSession = useSetAtom(clearPermissionsForSessionAtom);
  const clearQuestionsForSession = useSetAtom(clearQuestionsForSessionAtom);
  const clearPlanApprovalsForSession = useSetAtom(
    clearPlanApprovalsForSessionAtom,
  );
  const clearPlanForSession = useSetAtom(clearPlanForSessionAtom);
  const dismissPlanForSession = useSetAtom(dismissPlanForSessionAtom);
  const togglePlanCollapsedForSession = useSetAtom(
    togglePlanCollapsedForSessionAtom,
  );
  const clearChatComposerAttachment = useSetAtom(
    clearChatComposerAttachmentAtom,
  );
  const openFilePreview = useSetAtom(openFilePreviewAtom);
  const createDraftSession = useSetAtom(createDraftSessionAtom);
  const saveEditorViewSnapshot = useSetAtom(saveEditorViewSnapshotAtom);
  const setLastSelectedAgent = useSetAtom(lastSelectedAgentAtom);
  const markSessionMessage = useSetAtom(markSessionMessageAtom);
  const updateSessionCollaborationMode = useSetAtom(
    updateSessionCollaborationModeAtom,
  );
  const updateSessionPermissionMode = useSetAtom(
    updateSessionPermissionModeAtom,
  );
  const updateSessionStatus = useSetAtom(updateSessionStatusAtom);
  const updateSessionTitle = useSetAtom(updateSessionTitleAtom);
  const applyRefinedSessionTitle = useSetAtom(applyRefinedSessionTitleAtom);
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const openWorkspaceByPath = useSetAtom(openWorkspaceByPathAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const activeBranches = useAtomValue(activeBranchesAtom);
  const activeBranch = useAtomValue(activeBranchAtom);
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const activeSession = sessions.find(
    (session) =>
      session.id === activeSessionId &&
      session.workspaceId === activeWorkspaceId,
  );
  const activeQueuedInputs = activeSession
    ? (queuedInputsBySession[activeSession.id] ?? [])
    : [];
  const activeQueuedMessageIds = new Set(
    activeQueuedInputs.map((input) => input.messageId),
  );
  const activeMessages = activeSession
    ? (messagesBySession[activeSession.id] ?? []).filter(
        (message) => !activeQueuedMessageIds.has(message.id),
      )
    : [];
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
    ? Boolean(collapsedPlansBySession[activeSession.id])
    : false;
  const activeAgentRuntime = activeSession
    ? (agentRuntimeBySession[activeSession.id] ?? null)
    : null;
  // Agents that own plan mode (Grok Build) switch it off themselves once a plan
  // is approved or abandoned and report the new mode over ACP. Deriving the
  // composer toggle from that report keeps the two from drifting apart; the
  // stored session value is the source of truth only until the agent speaks.
  const activeCollaborationMode = getActiveCollaborationMode(
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
      void desktopApi.createSession({
        session: updatedSession,
        workspaceRootPath: activeWorkspace.rootPath,
      });
    }
  };
  const annotations = useAtomValue(annotationsAtom);

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
  useGitBranches(activeWorkspace);

  function formatAnnotationsContext(anns: BrowserAnnotation[]): string {
    if (anns.length === 0) return "";
    const lines = anns.map((a) => {
      if (a.type === "element") {
        const parts: string[] = [];
        if (a.tagName) parts.push(a.tagName);
        if (a.selector) parts.push(a.selector);
        const label = parts.join(" ") || "element";
        const text = a.textContent ? ` "${a.textContent}"` : "";
        const bounds = ` (${a.boundingBox.x}, ${a.boundingBox.y}) ${a.boundingBox.width}×${a.boundingBox.height}`;
        return `- Element: ${label}${text}${bounds}`;
      }
      return `- Region: (${a.boundingBox.x}, ${a.boundingBox.y}) ${a.boundingBox.width}×${a.boundingBox.height}`;
    });
    return `\n\n[Browser Annotations]\n${lines.join("\n")}`;
  }

  async function buildAnnotationAttachments(anns: BrowserAnnotation[]) {
    const screenshotAnnotations = anns.filter(
      (annotation) => annotation.regionScreenshot,
    );

    if (screenshotAnnotations.length === 0) {
      return [];
    }

    return Promise.all(
      screenshotAnnotations.map((annotation, index) =>
        importImageDataUrl(
          annotation.regionScreenshot ?? "",
          `browser-screenshot-${index + 1}.png`,
        ),
      ),
    );
  }

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
        sessionId: session.id,
        fallbackTitle,
        generatedTitle: title,
        messageLength: message.length,
      },
    );

    if (title === fallbackTitle) {
      logRendererDiagnostic(
        "debug",
        "[SessionTitle] local generation kept fallback",
        {
          sessionId: session.id,
          fallbackTitle,
        },
      );
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
        fallbackTitle,
        generatedTitle: title,
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
        sessionId: session.id,
        expectedTitle,
        fallbackTitle: session.title,
        messageLength: message.length,
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
            expectedTitle,
            returnedTitle: updatedSession?.title ?? null,
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
            sessionId: session.id,
            expectedTitle,
            error: error instanceof Error ? error.message : "Unknown error",
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
  ) => {
    if (
      !activeSession ||
      !activeWorkspace ||
      isSubagentSession(activeSession)
    ) {
      return;
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
      workspaceRootPath: activeWorkspace.rootPath,
      contentLength: message.length,
      attachmentCount: attachments.length,
    });

    try {
      const nextSession = prepareAutoSessionTitle(
        activeSession,
        message,
        activeMessages.length === 0 &&
          isDefaultSessionTitle(activeSession.title, activeSession.agentType),
      );
      const annotationContext = formatAnnotationsContext(annotations);
      const userMessage: MessageRecord = {
        id: crypto.randomUUID(),
        sessionId: nextSession.id,
        role: "user",
        content: message + annotationContext,
        attachments,
        createdAt: new Date().toISOString(),
      };
      const isQueuedFollowUp = delivery === "queue-after-run";

      if (!isQueuedFollowUp) {
        updateSessionStatus({ sessionId: nextSession.id, status: "running" });
        appendMessage(userMessage);
        markSessionMessage({
          sessionId: nextSession.id,
          createdAt: userMessage.createdAt,
        });
      }
      clearChatComposerAttachment();

      const annotationAttachments =
        await buildAnnotationAttachments(annotations);
      const nextAttachments = [...attachments, ...annotationAttachments];
      logRendererDiagnostic("info", "[AgentSession] send payload", {
        attachments: nextAttachments.map(summarizeAttachmentForLog),
        collaborationMode: nextSession.collaborationMode,
        content: userMessage.content,
        createdAt: userMessage.createdAt,
        messageId: userMessage.id,
        permissionMode: nextSession.permissionMode ?? null,
        providerSnapshot: summarizeProviderSnapshotForLog(
          nextSession.providerSnapshot,
        ),
        session: {
          agentType: nextSession.agentType,
          id: nextSession.id,
          title: nextSession.title,
          workspaceId: nextSession.workspaceId,
        },
        thinkingLevel:
          thinkingLevelOptions.length > 0 ? selectedThinkingLevel : undefined,
        workspaceRootPath: activeWorkspace.rootPath,
      });
      const savedMessage = await desktopApi.sendMessage({
        session: nextSession,
        workspaceRootPath: activeWorkspace.rootPath,
        messageId: userMessage.id,
        createdAt: userMessage.createdAt,
        content: userMessage.content,
        attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
        thinkingLevel: selectedThinkingLevel ?? undefined,
        delivery,
      });

      if (isQueuedFollowUp) {
        appendQueuedInput({
          messageId: savedMessage.id,
          sessionId: savedMessage.sessionId,
          workspaceRootPath: activeWorkspace.rootPath,
          thinkingLevel: selectedThinkingLevel ?? undefined,
          createdAt: savedMessage.createdAt,
          message: savedMessage,
        });
        markSessionMessage({
          sessionId: savedMessage.sessionId,
          createdAt: savedMessage.createdAt,
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
      if (delivery !== "queue-after-run") {
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
  };

  const handleUpdateQueuedInput = async (
    item: QueuedAgentInputItem,
    content: string,
  ) => {
    const message = await desktopApi.updateQueuedInput({
      sessionId: item.sessionId,
      messageId: item.messageId,
      content,
    });
    updateQueuedInput(message);
  };

  const handleDeleteQueuedInput = async (item: QueuedAgentInputItem) => {
    await desktopApi.deleteQueuedInput({
      sessionId: item.sessionId,
      messageId: item.messageId,
    });
    removeQueuedInput({
      sessionId: item.sessionId,
      messageId: item.messageId,
    });
  };

  const handleSteerQueuedInput = async (item: QueuedAgentInputItem) => {
    await desktopApi.steerQueuedInput({
      sessionId: item.sessionId,
      messageId: item.messageId,
    });
  };

  const clearEphemeralSessionState = (sessionId: string) => {
    clearToolCallsForSession(sessionId);
    clearPermissionsForSession(sessionId);
    clearQuestionsForSession(sessionId);
    clearPlanApprovalsForSession(sessionId);
    clearPlanForSession(sessionId);
  };

  const handleCheckPreviousMessageCheckpoint = async (
    message: MessageRecord,
  ) => {
    if (!activeSession) {
      return { available: false };
    }

    return desktopApi.getPreviousMessageCheckpointStatus(
      activeSession.id,
      message.id,
    );
  };

  const handleSubmitPreviousMessage = async (
    message: MessageRecord,
    content: string,
    revertWorkspace: boolean,
  ) => {
    if (!activeSession || !activeWorkspace) {
      return;
    }

    const requestId = crypto.randomUUID();
    const startedAt = performance.now();

    logRendererDiagnostic("info", "[AgentSession] submit previous message", {
      requestId,
      sessionId: activeSession.id,
      messageId: message.id,
      revertWorkspace,
    });

    try {
      const userMessage = await desktopApi.submitPreviousMessage({
        session: activeSession,
        workspaceRootPath: activeWorkspace.rootPath,
        messageId: message.id,
        content,
        attachments:
          message.attachments.length > 0 ? message.attachments : undefined,
        revertWorkspace,
      });

      updateSessionStatus({ sessionId: activeSession.id, status: "running" });
      rewindMessages({ message: userMessage });
      clearEphemeralSessionState(activeSession.id);
      markSessionMessage({
        sessionId: activeSession.id,
        createdAt: userMessage.createdAt,
      });
      logRendererDiagnostic(
        "info",
        "[AgentSession] submit previous message completed",
        {
          requestId,
          sessionId: activeSession.id,
          messageId: message.id,
          durationMs: Math.round(performance.now() - startedAt),
        },
      );
    } catch (error) {
      updateSessionStatus({ sessionId: activeSession.id, status: "error" });
      console.error("[AgentSession] submit previous message failed", {
        requestId,
        sessionId: activeSession.id,
        messageId: message.id,
        durationMs: Math.round(performance.now() - startedAt),
      });
      appendMessage({
        id: crypto.randomUUID(),
        sessionId: activeSession.id,
        role: "system",
        content:
          error instanceof Error
            ? error.message
            : "Unknown previous message submit error",
        attachments: [],
        createdAt: new Date().toISOString(),
      });
    }
  };

  const handleStop = async () => {
    if (!activeSession || isSubagentSession(activeSession)) {
      return;
    }

    updateSessionStatus({ sessionId: activeSession.id, status: "idle" });
    await desktopApi.stopSession(activeSession.id);
  };

  const handleAnswerQuestion = async (
    question: AgentQuestionRequestRecord,
    answer: string,
  ) => {
    await desktopApi.resolveQuestion(question.id, answer);
  };

  const handleResolvePlanApproval = async (
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ) => {
    await desktopApi.resolvePlanApproval(approvalId, decision);
  };

  // Chat-mode "first message": create the conversation with the picked model,
  // then send the first turn and focus it. Mirrors the agent handleStartSession
  // seam but routes through the pure-chat IPC + conversation store.
  const handleStartConversation = async ({
    providerId,
    modelId,
    webSearchEnabled,
    message,
    attachments = [],
  }: StartConversationPayload) => {
    try {
      const images = await rehydrateChatImages(attachments);
      const conversation = await desktopApi.chatCreate({
        providerId,
        modelId,
        webSearchEnabled,
      });
      upsertConversation({ conversation });
      setActiveConversationId(conversation.id);
      const userMessage = await desktopApi.chatSendMessage({
        conversationId: conversation.id,
        text: message,
        images: images.length > 0 ? images : undefined,
      });
      appendConversationMessage(userMessage);
    } catch (error) {
      console.error("[Chat] start conversation failed", error);
    }
  };

  const handleOpenWorkspace = async () => {
    const result = await desktopApi.openWorkspace();
    if (result.canceled || result.filePaths.length === 0) return;
    const { didSwitchProject } = openWorkspaceByPath(result.filePaths[0]);
    if (didSwitchProject) {
      setActiveConversationId(null);
      selectSession(null);
    }
  };

  const handleSelectBranch = async (branch: string) => {
    if (!activeWorkspace || branch === activeBranch) {
      return;
    }

    await desktopApi.checkoutGitBranch(activeWorkspace.rootPath, branch);
  };

  const handleStartSession = async ({
    agentType,
    collaborationMode,
    permissionMode,
    attachments,
    message,
    providerSnapshot,
    thinkingLevel,
  }: {
    agentType: AgentId;
    collaborationMode: CollaborationModeKind;
    permissionMode?: AgentPermissionMode | null;
    attachments?: MessageAttachment[];
    message: string;
    providerSnapshot?: AgentProviderSnapshot | null;
    thinkingLevel?: AgentThinkingLevel;
  }) => {
    if (!activeWorkspace) {
      return;
    }

    const session = createDraftSession({
      workspaceId: activeWorkspace.id,
      agentType,
      collaborationMode,
      permissionMode,
      providerSnapshot: providerSnapshot ?? null,
    });
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
      workspaceRootPath: activeWorkspace.rootPath,
      contentLength: message.length,
      attachmentCount: attachments?.length ?? 0,
    });

    try {
      const annotationContext = formatAnnotationsContext(annotations);
      const initialAttachments = attachments ?? [];
      const userMessage: MessageRecord = {
        id: crypto.randomUUID(),
        sessionId: titledSession.id,
        role: "user",
        content: message + annotationContext,
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

      await desktopApi.createSession({
        session: titledSession,
        workspaceRootPath: activeWorkspace.rootPath,
      });

      const annotationAttachments =
        await buildAnnotationAttachments(annotations);
      const nextAttachments = [...initialAttachments, ...annotationAttachments];
      logRendererDiagnostic(
        "info",
        "[AgentSession] start session send payload",
        {
          attachments: nextAttachments.map(summarizeAttachmentForLog),
          collaborationMode: titledSession.collaborationMode,
          content: userMessage.content,
          createdAt: userMessage.createdAt,
          messageId: userMessage.id,
          permissionMode: titledSession.permissionMode ?? null,
          providerSnapshot: summarizeProviderSnapshotForLog(
            titledSession.providerSnapshot,
          ),
          session: {
            agentType: titledSession.agentType,
            id: titledSession.id,
            title: titledSession.title,
            workspaceId: titledSession.workspaceId,
          },
          thinkingLevel,
          workspaceRootPath: activeWorkspace.rootPath,
        },
      );
      await desktopApi.sendMessage({
        session: titledSession,
        workspaceRootPath: activeWorkspace.rootPath,
        messageId: userMessage.id,
        createdAt: userMessage.createdAt,
        content: userMessage.content,
        attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
        thinkingLevel,
      });

      // sendMessage persists the session again, so refinement must run after
      // it to avoid the local fallback overwriting the generated title.
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
  };

  const persistSession = (session: SessionRecord) => {
    if (!activeWorkspace) {
      return;
    }

    void desktopApi.createSession({
      session,
      workspaceRootPath: activeWorkspace.rootPath,
    });
  };

  const handleSelectCollaborationMode = (
    mode: CollaborationModeKind,
    sessionId: string,
  ) => {
    const updatedSession = updateSessionCollaborationMode({
      sessionId,
      collaborationMode: mode,
    });

    if (updatedSession) {
      persistSession(updatedSession);
    }

    // A live agent owns its own mode, and the stored value would only reach it
    // on the next prompt. Push the switch now so it also applies mid-turn;
    // agents without runtime modes keep picking it up from the session record.
    const runtimeModes = agentRuntimeBySession[sessionId]?.mode;
    if (runtimeModes?.availableModes.some(({ id }) => id === mode)) {
      void desktopApi.setSessionRuntimeMode(sessionId, mode);
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

  // Pure chat takes precedence over agent session rendering — selecting a
  // conversation from the sidebar swaps the entire center pane without
  // mutating the active agent session.
  if (activeConversation) {
    return (
      <section className="flex h-full flex-col bg-chat-canvas">
        <div className="shrink-0" style={{ height: TITLEBAR_HEIGHT }} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <ConversationDetail
            key={activeConversation.id}
            conversation={activeConversation}
          />
        </div>
      </section>
    );
  }

  // The "no session yet" surface. The projects tab keeps the agent card even
  // with no project open — its heading and workspace picker are what point the
  // user at a folder — while the chat tab gets the chat card.
  let newSessionSurface: ReactNode;
  if (activeWorkspace || sidebarTab === "projects") {
    newSessionSurface = (
      <ComposerSurface>
        <NewSessionCard
          activeBranch={activeBranch}
          activeBranches={activeBranches}
          activeWorkspaceId={activeWorkspaceId}
          agents={agents}
          agentType={lastSelectedAgent}
          attachment={composerAttachment ?? undefined}
          collaborationMode="default"
          composerRef={composerRef}
          onClearAttachment={clearChatComposerAttachment}
          onOpenWorkspace={handleOpenWorkspace}
          onSelectBranch={handleSelectBranch}
          onSelectAgent={setLastSelectedAgent}
          onSelectWorkspace={selectWorkspace}
          onStartSession={handleStartSession}
          sessionTitle={undefined}
          workspaces={workspaces}
          workspaceRootPath={activeWorkspace?.rootPath}
          workspaceName={activeWorkspace?.name}
        />
      </ComposerSurface>
    );
  } else {
    newSessionSurface = (
      <ComposerSurface>
        <NewConversationCard
          onStartConversation={(payload) => {
            void handleStartConversation(payload);
          }}
        />
      </ComposerSurface>
    );
  }

  return (
    <section className="flex h-full flex-col bg-chat-canvas">
      {hideTitlebarSpacer ? null : (
        <div className="shrink-0" style={{ height: TITLEBAR_HEIGHT }} />
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeSession && activeSessionDataLoaded ? (
          <ChatView
            // Tie ChatView's identity to the session. Its scroll position,
            // "initial bottom settled" gate and other session-scoped state
            // should not bleed across switches — reusing the instance caused
            // a flash where the previous session's scrollTop was applied to
            // the new content before the layout effect pulled it to bottom.
            key={activeSession.id}
            activeBranch={activeBranch}
            workspaceName={activeWorkspace?.name}
            agentLabel={agentLabels[activeSession.agentType]}
            agentType={activeSession.agentType}
            attachment={composerAttachment ?? undefined}
            collaborationMode={activeCollaborationMode}
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
            onOpenToolLocation={openFilePreview}
            onResolvePermission={desktopApi.resolvePermission}
            onSelectCollaborationMode={(mode) =>
              handleSelectCollaborationMode(mode, activeSession.id)
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
            onSelectAgent={undefined}
            onCheckPreviousMessageCheckpoint={
              handleCheckPreviousMessageCheckpoint
            }
            onSend={handleSend}
            onDeleteQueuedInput={handleDeleteQueuedInput}
            onSteerQueuedInput={handleSteerQueuedInput}
            onUpdateQueuedInput={handleUpdateQueuedInput}
            onSubmitPreviousMessage={
              isSubagentSession(activeSession)
                ? undefined
                : handleSubmitPreviousMessage
            }
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
            workspaceRootPath={activeWorkspace?.rootPath}
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
        ) : activeSession ? null : (
          newSessionSurface
        )}
      </div>
    </section>
  );
}
