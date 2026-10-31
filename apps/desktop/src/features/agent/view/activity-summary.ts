import {
  type ActivityActionCount,
  summarizeToolActions,
} from "@cocurdex/shared";
import { isReasoningMessage } from "./chat-message-utils";
import type { TimelineGroup } from "./chat-timeline";

export type ActivitySummary =
  | { kind: "actions"; actions: ActivityActionCount[]; otherCount: number }
  | { kind: "reasoning"; count: number }
  | { kind: "replies"; count: number };

export function summarizeActivity(items: TimelineGroup[]): ActivitySummary {
  const toolCalls = items.flatMap((item) =>
    item.kind === "toolCalls" ? item.toolCalls : [],
  );

  if (toolCalls.length === 0) {
    const reasoningCount = items.filter(
      (item) => item.kind === "message" && isReasoningMessage(item.message),
    ).length;
    return reasoningCount > 0
      ? { kind: "reasoning", count: reasoningCount }
      : { kind: "replies", count: items.length };
  }

  return { kind: "actions", ...summarizeToolActions(toolCalls) };
}

export function getSingleToolCall(items: TimelineGroup[]) {
  const [item] = items;
  if (items.length !== 1 || item?.kind !== "toolCalls") {
    return null;
  }
  return item.toolCalls.length === 1 ? (item.toolCalls[0] ?? null) : null;
}

export function hasActiveToolCall(items: TimelineGroup[]) {
  return items.some(
    (item) =>
      item.kind === "toolCalls" &&
      item.toolCalls.some(
        (toolCall) =>
          toolCall.status === "pending" || toolCall.status === "in_progress",
      ),
  );
}
