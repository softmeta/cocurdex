import {
  type AgentId,
  type AgentPermissionMode,
  type AgentProviderSnapshot,
  type AgentThinkingLevel,
  type BrowserAnnotation,
  hashLogValue,
  type MessageAttachment,
  type MessageRecord,
  primaryWorkspaceRootPath,
  type SessionRecord,
  type SessionStatus,
  sessionConfiguration,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import {
  appendMessageAtom,
  appendQueuedInputAtom,
  getAgentInputDelivery,
  loadSessionMessagesAtom,
  loadSessionToolCallsAtom,
  removeQueuedInputAtom,
} from "@/features/agent";
import type { ComposerSendOutcome } from "@/features/composer";
import {
  clearChatComposerAttachmentAtom,
  saveEditorViewSnapshotAtom,
} from "@/features/editor";
import {
  beginSessionSendAtom,
  createDraftSessionAtom,
  isDefaultSessionTitle,
  isSubagentSession,
  markSessionMessageAtom,
  settleSessionSendAtom,
  updateSessionStatusAtom,
} from "@/features/sessions";
import { draftWorktreePathAtom } from "@/features/workspaces";
import { desktopApi, logRendererDiagnostic, taskApi } from "@/lib";
import { buildBrowserAnnotationAttachments } from "./chat-window/browser-annotation-attachments";
import { withBrowserAnnotations } from "./chat-window/browser-annotation-message";
import {
  consumeBrowserAnnotations,
  useBrowserAnnotationSender,
} from "./chat-window/chat-browser-context";

import {
  summarizeAttachmentForLog,
  summarizeProviderSnapshotForLog,
} from "./session-send-diagnostics";
import { useSessionSendTitle } from "./use-session-send-title";

interface CenterSessionSendContext {
  activeSession: SessionRecord | undefined;
  activeWorkspace: WorkspaceRecord | undefined;
  activeDisplayStatus: SessionStatus | undefined;
  activeAgentSupportsSteering: boolean;
  activeAgentUsesNativeSessionTitles: boolean;
  followUpBehavior: Parameters<typeof getAgentInputDelivery>[0]["behavior"];
  canDriveActiveSession: boolean;
  hasMessages: boolean;
  hasThinkingOptions: boolean;
  selectedThinkingLevel: AgentThinkingLevel | null;
  composerAttachment: MessageAttachment | null;
  annotations: BrowserAnnotation[];
  sessionRootPath: string | null;
  workingPath: string | null;
  draftWorktreePath: string | null;
  openWorkspaceFromDialog(): Promise<WorkspaceRecord | null>;
}

export function useCenterSessionSend({
  activeSession,
  activeWorkspace,
  activeDisplayStatus,
  activeAgentSupportsSteering,
  activeAgentUsesNativeSessionTitles,
  followUpBehavior,
  canDriveActiveSession,
  hasMessages,
  hasThinkingOptions,
  selectedThinkingLevel,
  composerAttachment,
  annotations,
  sessionRootPath,
  workingPath,
  draftWorktreePath,
  openWorkspaceFromDialog,
}: CenterSessionSendContext) {
  const appendMessage = useSetAtom(appendMessageAtom);
  const appendQueuedInput = useSetAtom(appendQueuedInputAtom);
  const removeQueuedInput = useSetAtom(removeQueuedInputAtom);
  const clearChatComposerAttachment = useSetAtom(
    clearChatComposerAttachmentAtom,
  );
  const createDraftSession = useSetAtom(createDraftSessionAtom);
  const saveEditorViewSnapshot = useSetAtom(saveEditorViewSnapshotAtom);
  const setDraftWorktreePath = useSetAtom(draftWorktreePathAtom);
  const markSessionMessage = useSetAtom(markSessionMessageAtom);
  const updateSessionStatus = useSetAtom(updateSessionStatusAtom);
  const beginSessionSend = useSetAtom(beginSessionSendAtom);
  const settleSessionSend = useSetAtom(settleSessionSendAtom);
  const loadSessionMessages = useSetAtom(loadSessionMessagesAtom);
  const loadSessionToolCalls = useSetAtom(loadSessionToolCallsAtom);

  const { prepareAutoSessionTitle, refineAutoSessionTitle } =
    useSessionSendTitle();

  const handleSend = async (
    message: string,
    attachments: MessageAttachment[] = composerAttachment
      ? [composerAttachment]
      : [],
    useOppositeFollowUpBehavior = false,
    sentAnnotations: BrowserAnnotation[] = annotations,
  ): Promise<ComposerSendOutcome> => {
    if (
      !(activeSession && canDriveActiveSession) ||
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
      workspaceHash: hashLogValue(sessionRootPath ?? ""),
      contentLength: message.length,
      attachmentCount: attachments.length,
    });

    let optimisticQueuedMessageId: string | null = null;
    let sendInFlight = false;
    try {
      const nextSession = prepareAutoSessionTitle(
        activeSession,
        message,
        !hasMessages &&
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
        workspaceRootPath: sessionRootPath ?? "",
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
        sendInFlight = true;
        beginSessionSend(nextSession.id);
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
        thinkingLevel: hasThinkingOptions ? selectedThinkingLevel : undefined,
        workspaceHash: hashLogValue(sessionRootPath ?? ""),
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
    } finally {
      if (sendInFlight) settleSessionSend(activeSession.id);
    }
    return "sent";
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
    loadSessionMessages({ messages: [], sessionId: session.id });
    loadSessionToolCalls({ sessionId: session.id, toolCalls: [] });
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

      beginSessionSend(titledSession.id);
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
    } finally {
      settleSessionSend(titledSession.id);
    }
    return "sent";
  };

  useBrowserAnnotationSender((sent) => {
    void handleSend("", [], false, sent);
  });

  return { handleSend, handleStartSession };
}
