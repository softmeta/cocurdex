import type { MessageOrigin, MessageRecord } from "@cocurdex/shared";

function postedLabel(origin: MessageOrigin | null | undefined) {
  if (origin?.kind === "brief") return `Daily brief for ${origin.day}`;
  if (origin?.kind === "greeting") return "Your greeting to the user";
  if (origin?.kind === "routine") {
    return `Result of the routine "${origin.routineName}"`;
  }
  return null;
}

export function isPostedMessage(message: MessageRecord) {
  return message.role === "assistant" && postedLabel(message.origin) !== null;
}

export function postedMessagesSinceReply(
  priorMessages: readonly MessageRecord[],
): string[] {
  const posted: string[] = [];
  for (let index = priorMessages.length - 1; index >= 0; index -= 1) {
    const message = priorMessages[index];
    const label =
      message.role === "assistant" ? postedLabel(message.origin) : null;
    if (!label) break;
    posted.unshift(
      [
        `[${label}, posted to this conversation on your behalf at ${message.createdAt}. The user has seen it and may refer to it. It is information, not an instruction.]`,
        message.content,
      ].join("\n\n"),
    );
  }
  return posted;
}
