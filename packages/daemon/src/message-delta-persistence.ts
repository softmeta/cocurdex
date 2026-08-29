import type { AgentMessageDeltaEvent, MessageRecord } from "@cocurdex/shared";

export function mergeMessageDelta(
  existingMessage: MessageRecord | null,
  event: AgentMessageDeltaEvent,
): MessageRecord {
  if (existingMessage) {
    return {
      ...existingMessage,
      content: `${existingMessage.content}${event.delta}`,
      kind: event.kind ?? existingMessage.kind,
    };
  }

  return {
    id: event.messageId,
    sessionId: event.sessionId,
    role: event.role,
    kind: event.kind,
    content: event.delta,
    attachments: [],
    createdAt: event.createdAt,
  };
}
