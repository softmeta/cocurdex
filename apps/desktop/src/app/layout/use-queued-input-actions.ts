import { useSetAtom } from "jotai";
import {
  discardQueuedInputAtom,
  markQueueResumedAtom,
  type QueuedAgentInputItem,
  updateQueuedInputAtom,
} from "@/features/agent";
import { desktopApi } from "@/lib";

function actionPayload(item: QueuedAgentInputItem) {
  return { sessionId: item.sessionId, messageId: item.messageId };
}

export function useQueuedInputActions() {
  const updateQueuedInput = useSetAtom(updateQueuedInputAtom);
  const discardQueuedInput = useSetAtom(discardQueuedInputAtom);
  const markQueueResumed = useSetAtom(markQueueResumedAtom);

  return {
    onUpdateQueuedInput: async (
      item: QueuedAgentInputItem,
      content: string,
    ) => {
      const message = await desktopApi.updateQueuedInput({
        ...actionPayload(item),
        content,
      });
      updateQueuedInput(message);
    },
    onDeleteQueuedInput: async (item: QueuedAgentInputItem) => {
      await desktopApi.deleteQueuedInput(actionPayload(item));
      discardQueuedInput(actionPayload(item));
    },
    onSendNowQueuedInput: async (item: QueuedAgentInputItem) => {
      await desktopApi.sendQueuedInputNow(actionPayload(item));
      markQueueResumed(item.sessionId);
    },
    onSteerQueuedInput: async (item: QueuedAgentInputItem) => {
      await desktopApi.steerQueuedInput(actionPayload(item));
    },
    onResumeQueuedInputs: async (sessionId: string) => {
      await desktopApi.resumeQueuedInputs(sessionId);
      markQueueResumed(sessionId);
    },
  };
}
