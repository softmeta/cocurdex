import type { MessageRecord, SendSessionCommand } from "@cocurdex/shared";

export class MessageIdConflictError extends Error {
  constructor(messageId: string) {
    super(`Message ID ${messageId} was already used for a different message`);
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
