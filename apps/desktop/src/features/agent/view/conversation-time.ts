import {
  conversationSeparatorTime,
  parseConversationTime,
} from "@cocurdex/client-runtime";
import type { ConversationGroup, TimelineGroup } from "./chat-timeline";

function timelineGroupTime(group: TimelineGroup): string {
  switch (group.kind) {
    case "message":
      return group.message.createdAt;
    case "toolCalls":
      return group.toolCalls[0]?.startedAt ?? "";
    case "worktreeSetup":
    case "contextCompaction":
      return group.toolCall.startedAt;
    case "permission":
      return group.permission.createdAt;
    case "question":
      return group.question.createdAt;
  }
}

export function conversationStartTime(group: ConversationGroup) {
  const first = group.items[0];
  return parseConversationTime(
    group.prompt?.createdAt ?? (first ? timelineGroupTime(first) : undefined),
  );
}

export function conversationEndTime(group: ConversationGroup) {
  const last = group.items.at(-1);
  return parseConversationTime(
    last ? timelineGroupTime(last) : group.prompt?.createdAt,
  );
}

export function separatorTimeBefore(
  previous: ConversationGroup | undefined,
  current: ConversationGroup,
): number | null {
  return conversationSeparatorTime(
    previous ? conversationEndTime(previous) : null,
    conversationStartTime(current),
  );
}
