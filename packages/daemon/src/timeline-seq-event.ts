import type { AgentEvent, MessageRecord } from "@cocurdex/shared";

export function withMessageSeq(
  message: MessageRecord,
  seq: number | null | undefined,
): MessageRecord {
  return typeof seq === "number" ? { ...message, seq } : message;
}

export function withTimelineSeq(
  event: AgentEvent,
  seq: number | null | undefined,
): AgentEvent {
  if (typeof seq !== "number") {
    return event;
  }
  if (event.type === "message.delta") {
    return { ...event, seq };
  }
  if (event.type === "message.completed") {
    return { ...event, message: { ...event.message, seq } };
  }
  if (
    event.type === "tool.started" ||
    event.type === "tool.updated" ||
    event.type === "tool.finished"
  ) {
    return { ...event, toolCall: { ...event.toolCall, seq } };
  }
  return event;
}
