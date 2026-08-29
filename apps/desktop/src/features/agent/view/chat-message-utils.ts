import type {
  ContextFileAttachment,
  ContextFolderAttachment,
  MessageRecord,
} from "@cocurdex/shared";
import { isContextFolderAttachment } from "@cocurdex/shared";

type ContextAttachment = ContextFileAttachment | ContextFolderAttachment;

export type MentionContentSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; attachment: ContextAttachment };

function getAttachmentPath(attachment: ContextAttachment) {
  return isContextFolderAttachment(attachment)
    ? attachment.folderPath
    : attachment.filePath;
}

// The composer serializes each mention pill inline as `@relative/path`, so the
// message body records where the user put it. Pair those markers back with the
// attachments (in document order) to render pills at their original position.
// Attachments without a marker — older messages, agent-added context — fall
// back to leading pills so nothing is dropped.
export function splitContentByMentions(
  content: string,
  attachments: ContextAttachment[],
): {
  leadingAttachments: ContextAttachment[];
  segments: MentionContentSegment[];
} {
  const remaining = [...attachments];
  const segments: MentionContentSegment[] = [];
  let cursor = 0;

  for (const match of content.matchAll(/@\S+/g)) {
    const index = match.index ?? 0;
    const token = match[0].slice(1);
    const matchedIndex = remaining.findIndex((attachment) =>
      getAttachmentPath(attachment).endsWith(token),
    );
    if (matchedIndex === -1) continue;

    const [attachment] = remaining.splice(matchedIndex, 1);
    if (!attachment) continue;
    if (index > cursor) {
      segments.push({ kind: "text", text: content.slice(cursor, index) });
    }
    segments.push({ kind: "mention", attachment });
    cursor = index + match[0].length;
  }

  if (cursor < content.length) {
    segments.push({ kind: "text", text: content.slice(cursor) });
  }

  return { leadingAttachments: remaining, segments };
}

export function isReasoningMessage(message: MessageRecord) {
  return message.role === "assistant" && message.kind === "reasoning";
}

export function isAssistantEchoOfPrompt(
  message: MessageRecord,
  prompt?: MessageRecord,
) {
  return (
    prompt?.role === "user" &&
    message.role === "assistant" &&
    message.attachments.length === 0 &&
    message.content.trim() === prompt.content.trim()
  );
}
