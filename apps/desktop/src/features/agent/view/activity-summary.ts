import type { AgentToolCallRecord } from "@cocurdex/shared";
import {
  type ActivityAction,
  getActivityAction,
} from "../tool-call/tool-call-action";
import { isReasoningMessage } from "./chat-message-utils";
import type { TimelineGroup } from "./chat-timeline";

export type ActivitySummary =
  | { kind: "actions"; actions: ActivityActionCount[]; otherCount: number }
  | { kind: "reasoning"; count: number }
  | { kind: "replies"; count: number };

export type ActivityActionCount = { action: ActivityAction; count: number };

const MAX_SUMMARY_ACTIONS = 2;

const ACTION_PRIORITY: Record<ActivityAction, number> = {
  command: 0,
  edit: 0,
  subagent: 0,
  fetch: 1,
  read: 1,
  search: 1,
  skill: 1,
  other: 2,
};

function countActionTargets(
  action: ActivityAction,
  toolCalls: AgentToolCallRecord[],
) {
  if (action !== "edit") {
    return toolCalls.length;
  }
  const paths = new Set<string>();
  let withoutPath = 0;
  for (const toolCall of toolCalls) {
    if (toolCall.locations.length === 0) {
      withoutPath += 1;
    }
    for (const location of toolCall.locations) {
      paths.add(location.path);
    }
  }
  return paths.size + withoutPath;
}

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

  const byAction = new Map<ActivityAction, AgentToolCallRecord[]>();
  for (const toolCall of toolCalls) {
    const action = getActivityAction(toolCall);
    byAction.set(action, [...(byAction.get(action) ?? []), toolCall]);
  }

  const ranked = [...byAction.entries()].map(([action, calls], index) => ({
    action,
    calls,
    index,
  }));
  const selected = ranked
    .filter(({ action }) => action !== "other" || ranked.length === 1)
    .sort(
      (a, b) =>
        ACTION_PRIORITY[a.action] - ACTION_PRIORITY[b.action] ||
        a.index - b.index,
    )
    .slice(0, MAX_SUMMARY_ACTIONS)
    .sort((a, b) => a.index - b.index);
  const summarizedCallCount = selected.reduce(
    (count, { calls }) => count + calls.length,
    0,
  );

  return {
    kind: "actions",
    actions: selected.map(({ action, calls }) => ({
      action,
      count: countActionTargets(action, calls),
    })),
    otherCount: toolCalls.length - summarizedCallCount,
  };
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
