import type { MessageRecord, SessionStatus } from "@cocurdex/shared";

export function isSessionAwaitingResponse(messages: MessageRecord[]) {
  return messages.at(-1)?.role === "user";
}

export function getDisplaySessionStatus(
  status: SessionStatus | undefined,
  messages: MessageRecord[],
): SessionStatus | undefined {
  if (status) {
    return status;
  }

  if (isSessionAwaitingResponse(messages)) {
    return "running";
  }

  return status;
}
