import {
  type MessageRecord,
  ReasonError,
  type SendSessionCommand,
} from "@cocurdex/shared";

export class MessageIdConflictError extends ReasonError<"message.idConflict"> {
  constructor(messageId: string) {
    super(
      "message.idConflict",
      `Message ID ${messageId} was already used for a different message`,
    );
    this.name = "MessageIdConflictError";
  }
}

function sameAttachments(
  stored: MessageRecord["attachments"],
  sent: SendSessionCommand["attachments"],
) {
  return JSON.stringify(stored) === JSON.stringify(sent ?? []);
}

export function resolveRepeatedSend(
  existing: MessageRecord,
  command: SendSessionCommand,
): MessageRecord {
  const isSameMessage =
    existing.sessionId === command.sessionId &&
    existing.role === "user" &&
    existing.content === command.content.trim() &&
    sameAttachments(existing.attachments, command.attachments);
  if (!isSameMessage) throw new MessageIdConflictError(command.messageId);
  return existing;
}
