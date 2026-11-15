import type { MessageRecord } from "@cocurdex/shared";
import { isPostedMessage } from "./posted-messages";

export function unansweredInputsBefore(
  priorMessages: readonly MessageRecord[],
): MessageRecord[] {
  const unanswered: MessageRecord[] = [];
  for (let index = priorMessages.length - 1; index >= 0; index -= 1) {
    const message = priorMessages[index];
    if (isPostedMessage(message)) continue;
    if (message.role !== "user" || message.runId) break;
    unanswered.unshift(message);
  }
  return unanswered;
}

export function inboxTurnContent(
  unanswered: readonly MessageRecord[],
  content: string,
) {
  if (unanswered.length === 0) return content;
  const earlier = unanswered.map((message) =>
    [
      `[Received at ${message.createdAt} while you were busy. Answer it together with the newest message.]`,
      message.content,
    ].join("\n\n"),
  );
  return [...earlier, `[Newest message]\n\n${content}`].join("\n\n");
}
