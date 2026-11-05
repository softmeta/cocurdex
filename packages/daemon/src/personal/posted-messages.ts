import type { MessageOrigin, MessageRecord } from "@cocurdex/shared";

function postedLabel(origin: MessageOrigin | null | undefined) {
  if (origin?.kind === "brief") return `Daily brief for ${origin.day}`;
  if (origin?.kind === "routine") {
    return `Result of the routine "${origin.routineName}"`;
  }
  return null;
}

export function buildPostedMessagesBlock(
  priorMessages: readonly MessageRecord[],
): string | null {
  const posted: string[] = [];
  for (let index = priorMessages.length - 1; index >= 0; index -= 1) {
    const message = priorMessages[index];
    const label =
      message.role === "assistant" ? postedLabel(message.origin) : null;
    if (!label) break;
    posted.unshift(`[${label}, ${message.createdAt}]\n${message.content}`);
  }
  if (posted.length === 0) return null;
  return [
    "<posted-to-this-conversation>",
    "These messages were posted into this conversation on your behalf since your last reply. The user has seen them and may refer to them.",
    ...posted,
    "</posted-to-this-conversation>",
  ].join("\n\n");
}
