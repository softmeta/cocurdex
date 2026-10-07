import type {
  AgentThinkingLevel,
  MessageAttachment,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { sessionConfiguration } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  appendMessageAtom,
  clearToolCallsForSessionAtom,
  rewindMessagesAtom,
} from "@/features/agent";
import {
  createChatSessionRecord,
  type StartChatPayload,
} from "@/features/chat";
import {
  applyRefinedSessionTitleAtom,
  bindFocusedPaneContentAtom,
  bindPaneContentAtom,
  generateLocalSessionTitle,
  markSessionMessageAtom,
  updateSessionStatusAtom,
  upsertSessionAtom,
} from "@/features/sessions";
import { desktopApi, logRendererDiagnostic, taskApi } from "@/lib";

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function createUserMessage(
  sessionId: string,
  content: string,
  attachments: MessageAttachment[],
): MessageRecord {
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: "user",
    content,
    attachments,
    createdAt: new Date().toISOString(),
  };
}

export function useChatSessionActions(paneId?: string) {
  const { t } = useTranslation("chat");
  const upsertSession = useSetAtom(upsertSessionAtom);
  const bindPaneContent = useSetAtom(bindPaneContentAtom);
  const bindFocusedPaneContent = useSetAtom(bindFocusedPaneContentAtom);
  const appendMessage = useSetAtom(appendMessageAtom);
  const rewindMessages = useSetAtom(rewindMessagesAtom);
  const clearToolCalls = useSetAtom(clearToolCallsForSessionAtom);
  const markSessionMessage = useSetAtom(markSessionMessageAtom);
  const updateSessionStatus = useSetAtom(updateSessionStatusAtom);
  const applyRefinedSessionTitle = useSetAtom(applyRefinedSessionTitleAtom);

  const reportFailure = (sessionId: string, error: unknown) => {
    updateSessionStatus({ sessionId, status: "error" });
    appendMessage({
      id: crypto.randomUUID(),
      sessionId,
      role: "system",
      content: errorText(error, t("message.error")),
      attachments: [],
      createdAt: new Date().toISOString(),
    });
  };

  const showOptimisticTurn = (message: MessageRecord) => {
    updateSessionStatus({ sessionId: message.sessionId, status: "running" });
    appendMessage(message);
    markSessionMessage({
      sessionId: message.sessionId,
      createdAt: message.createdAt,
    });
  };

  const refineTitle = (session: SessionRecord, text: string) => {
    void desktopApi
      .refineSessionTitle({
        sessionId: session.id,
        message: text,
        fallbackTitle: session.title,
        expectedTitle: session.title,
      })
      .then((refinedSession) => {
        if (refinedSession && refinedSession.title !== session.title) {
          applyRefinedSessionTitle({
            expectedTitle: session.title,
            refinedSession,
          });
        }
      })
      .catch((error) => {
        logRendererDiagnostic("debug", "[ChatSession] title refine failed", {
          sessionId: session.id,
          error: errorText(error, "Unknown error"),
        });
      });
  };

  const start = async (payload: StartChatPayload) => {
    const session = createChatSessionRecord({
      title: generateLocalSessionTitle(payload.text, t("list.new")),
      providerSnapshot: payload.providerSnapshot,
      now: new Date().toISOString(),
    });
    const message = createUserMessage(
      session.id,
      payload.text,
      payload.attachments,
    );
    upsertSession(session);
    if (paneId) {
      bindPaneContent({ paneId, sessionId: session.id });
    } else {
      bindFocusedPaneContent({ sessionId: session.id });
    }
    showOptimisticTurn(message);
    try {
      await taskApi.saveSessionConfiguration({
        ...sessionConfiguration(session),
        sessionKind: "chat",
      });
      await taskApi.sendMessage({
        sessionId: session.id,
        messageId: message.id,
        createdAt: message.createdAt,
        content: message.content,
        attachments: message.attachments,
        thinkingLevel: payload.thinkingLevel ?? undefined,
      });
      refineTitle(session, payload.text);
    } catch (error) {
      reportFailure(session.id, error);
    }
  };

  const send = async (
    session: SessionRecord,
    text: string,
    attachments: MessageAttachment[],
    thinkingLevel: AgentThinkingLevel | null,
  ) => {
    const message = createUserMessage(session.id, text, attachments);
    showOptimisticTurn(message);
    try {
      await taskApi.sendMessage({
        sessionId: session.id,
        messageId: message.id,
        createdAt: message.createdAt,
        content: message.content,
        attachments: message.attachments,
        thinkingLevel: thinkingLevel ?? undefined,
      });
    } catch (error) {
      reportFailure(session.id, error);
    }
  };

  const stop = async (session: SessionRecord) => {
    updateSessionStatus({ sessionId: session.id, status: "idle" });
    await taskApi.stopSession(session.id);
  };

  const resubmit = async (
    session: SessionRecord,
    message: MessageRecord,
    content: string,
  ) => {
    try {
      const userMessage = await taskApi.submitPreviousMessage({
        sessionId: session.id,
        messageId: message.id,
        content,
        attachments:
          message.attachments.length > 0 ? message.attachments : undefined,
        revertWorkspace: false,
      });
      updateSessionStatus({ sessionId: session.id, status: "running" });
      rewindMessages({ message: userMessage });
      clearToolCalls(session.id);
      markSessionMessage({
        sessionId: session.id,
        createdAt: userMessage.createdAt,
      });
    } catch (error) {
      reportFailure(session.id, error);
    }
  };

  const configure = async (session: SessionRecord) => {
    upsertSession(session);
    await taskApi.saveSessionConfiguration(sessionConfiguration(session));
  };

  return { configure, resubmit, send, start, stop };
}
