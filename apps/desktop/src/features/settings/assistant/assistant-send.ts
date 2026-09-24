import type {
  MessageAttachment,
  MessageRecord,
  SessionRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { primaryWorkspaceRootPath } from "@cocurdex/shared";
import { atom } from "jotai";
import {
  appendMessageAtom,
  appendQueuedInputAtom,
  followUpBehaviorAtom,
  getAgentInputDelivery,
  messagesBySessionAtom,
} from "@/features/agent";
import {
  agentsAtom,
  getDisplaySessionStatus,
  markSessionMessageAtom,
  sessionsAtom,
  updateSessionStatusAtom,
} from "@/features/sessions";
import { taskApi } from "@/lib/task-client";

export const sendAssistantMessageAtom = atom(
  null,
  async (
    get,
    set,
    payload: {
      session: SessionRecord;
      workspace: WorkspaceRecord;
      content: string;
      attachments?: MessageAttachment[];
      useOppositeFollowUpBehavior?: boolean;
    },
  ) => {
    const { session, workspace, content } = payload;
    const attachments = payload.attachments ?? [];
    const record =
      get(sessionsAtom).find((entry) => entry.id === session.id) ?? session;
    const messages = get(messagesBySessionAtom)[record.id] ?? [];
    const isRunning =
      getDisplaySessionStatus(record.status, messages) === "running";
    const supportsSteering = Boolean(
      get(agentsAtom).find((agent) => agent.id === record.agentType)
        ?.capabilities.supportsSteering,
    );
    const delivery = getAgentInputDelivery({
      behavior: get(followUpBehaviorAtom),
      isRunning,
      supportsSteering,
      useOppositeBehavior: payload.useOppositeFollowUpBehavior,
    });
    const userMessage: MessageRecord = {
      id: crypto.randomUUID(),
      sessionId: record.id,
      role: "user",
      content,
      attachments,
      createdAt: new Date().toISOString(),
    };
    const isQueuedFollowUp = delivery === "queue-after-run";
    if (!isQueuedFollowUp) {
      set(updateSessionStatusAtom, { sessionId: record.id, status: "running" });
      set(appendMessageAtom, userMessage);
      set(markSessionMessageAtom, {
        sessionId: record.id,
        createdAt: userMessage.createdAt,
      });
    }
    try {
      const savedMessage = await taskApi.sendMessage({
        sessionId: record.id,
        messageId: userMessage.id,
        createdAt: userMessage.createdAt,
        content: userMessage.content,
        attachments: attachments.length ? attachments : undefined,
        delivery,
      });
      if (isQueuedFollowUp) {
        set(appendQueuedInputAtom, {
          messageId: savedMessage.id,
          sessionId: record.id,
          workspaceRootPath: primaryWorkspaceRootPath(workspace),
          createdAt: savedMessage.createdAt,
          message: savedMessage,
        });
        set(markSessionMessageAtom, {
          sessionId: record.id,
          createdAt: savedMessage.createdAt,
        });
      }
    } catch (error) {
      if (!isQueuedFollowUp) {
        set(updateSessionStatusAtom, { sessionId: record.id, status: "error" });
      }
      set(appendMessageAtom, {
        id: crypto.randomUUID(),
        sessionId: record.id,
        role: "system",
        content:
          error instanceof Error
            ? error.message
            : "Unknown agent runtime error",
        attachments: [],
        createdAt: new Date().toISOString(),
      });
    }
  },
);
