import {
  type AgentPermissionRequestRecord,
  type AgentQuestionRequestRecord,
  type AgentToolCallRecord,
  type MessageRecord,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";
import {
  isAssistantEchoOfPrompt,
  isReasoningMessage,
} from "./chat-message-utils";

type TimelineItem =
  | {
      id: string;
      sortAt: string;
      kind: "message";
      message: MessageRecord;
    }
  | {
      id: string;
      sortAt: string;
      kind: "toolCall";
      toolCall: AgentToolCallRecord;
    }
  | {
      id: string;
      sortAt: string;
      kind: "permission";
      permission: AgentPermissionRequestRecord;
    }
  | {
      id: string;
      sortAt: string;
      kind: "question";
      question: AgentQuestionRequestRecord;
    };

type TimelineLane = {
  index: number;
  items: TimelineItem[];
};

const HIDDEN_TOOL_KINDS = new Set(["todowrite"]);

export type TimelineGroup =
  | {
      id: string;
      kind: "message";
      message: MessageRecord;
    }
  | {
      id: string;
      kind: "toolCalls";
      toolCalls: AgentToolCallRecord[];
    }
  | {
      id: string;
      kind: "worktreeSetup";
      toolCall: AgentToolCallRecord;
    }
  | {
      id: string;
      kind: "permission";
      permission: AgentPermissionRequestRecord;
    }
  | {
      id: string;
      kind: "question";
      question: AgentQuestionRequestRecord;
    };

export type ConversationGroup = {
  id: string;
  items: TimelineGroup[];
  prompt?: MessageRecord;
};

function messageItem(message: MessageRecord): TimelineItem {
  return {
    id: message.id,
    kind: "message",
    sortAt: message.createdAt,
    message,
  };
}

function toolCallItem(toolCall: AgentToolCallRecord): TimelineItem {
  return {
    id: toolCall.id,
    kind: "toolCall",
    sortAt: toolCall.startedAt,
    toolCall,
  };
}

function permissionItem(permission: AgentPermissionRequestRecord) {
  return {
    id: permission.id,
    kind: "permission",
    sortAt: permission.createdAt,
    permission,
  } satisfies TimelineItem;
}

function questionItem(question: AgentQuestionRequestRecord) {
  return {
    id: question.id,
    kind: "question",
    sortAt: question.createdAt,
    question,
  } satisfies TimelineItem;
}

function hasSeq<T extends { seq?: number }>(
  record: T,
): record is T & { seq: number } {
  return record.seq !== undefined;
}

function createSequencedLane(
  messages: MessageRecord[],
  toolCalls: AgentToolCallRecord[],
) {
  const sequenced = [
    ...messages
      .filter(hasSeq)
      .map((message) => ({ seq: message.seq, item: messageItem(message) })),
    ...toolCalls
      .filter(hasSeq)
      .map((toolCall) => ({ seq: toolCall.seq, item: toolCallItem(toolCall) })),
  ];
  return sequenced
    .sort((left, right) => left.seq - right.seq)
    .map((entry) => entry.item);
}

function createTimelineLanes(
  messages: MessageRecord[],
  toolCalls: AgentToolCallRecord[],
  permissions: AgentPermissionRequestRecord[],
  questions: AgentQuestionRequestRecord[],
): TimelineLane[] {
  const unsequencedMessages = messages.filter((message) => !hasSeq(message));
  const unsequencedToolCalls = toolCalls.filter(
    (toolCall) => !hasSeq(toolCall),
  );
  return [
    createSequencedLane(messages, toolCalls),
    unsequencedMessages.map(messageItem),
    unsequencedToolCalls.map(toolCallItem),
    permissions.map(permissionItem),
    questions.map(questionItem),
  ].map((items) => ({ index: 0, items }));
}

function takeNextTimelineItem(lanes: TimelineLane[]) {
  let nextLane: TimelineLane | null = null;

  for (const lane of lanes) {
    const item = lane.items[lane.index];
    if (!item) {
      continue;
    }
    if (!nextLane || item.sortAt < nextLane.items[nextLane.index].sortAt) {
      nextLane = lane;
    }
  }

  if (!nextLane) {
    return null;
  }
  const item = nextLane.items[nextLane.index];
  nextLane.index += 1;
  return item;
}

function isSubagentTimelineCall(toolCall: AgentToolCallRecord) {
  return Boolean(toolCall.subagent?.sessionId);
}

function canMergeToolCall(
  group: TimelineGroup,
  toolCall: AgentToolCallRecord,
): group is Extract<TimelineGroup, { kind: "toolCalls" }> {
  if (group.kind !== "toolCalls" || group.toolCalls.length === 0) {
    return false;
  }

  return (
    isSubagentTimelineCall(group.toolCalls[0]) ===
    isSubagentTimelineCall(toolCall)
  );
}

function appendTimelineItem(groups: TimelineGroup[], item: TimelineItem) {
  if (item.kind === "message") {
    if (item.message.role === "assistant" && !item.message.content.trim()) {
      return;
    }

    groups.push({
      id: item.id,
      kind: "message",
      message: item.message,
    });
    return;
  }

  if (item.kind === "permission") {
    groups.push({
      id: `permission-${item.id}`,
      kind: "permission",
      permission: item.permission,
    });
    return;
  }

  if (item.kind === "question") {
    groups.push({
      id: `question-${item.id}`,
      kind: "question",
      question: item.question,
    });
    return;
  }

  if (item.toolCall.kind && HIDDEN_TOOL_KINDS.has(item.toolCall.kind)) {
    return;
  }

  if (item.toolCall.kind === WORKTREE_SETUP_TOOL_KIND) {
    groups.push({
      id: `worktree-setup-${item.id}`,
      kind: "worktreeSetup",
      toolCall: item.toolCall,
    });
    return;
  }

  const lastGroup = groups.at(-1);

  if (lastGroup && canMergeToolCall(lastGroup, item.toolCall)) {
    lastGroup.toolCalls.push(item.toolCall);
    return;
  }

  groups.push({
    id: `tool-group-${item.id}`,
    kind: "toolCalls",
    toolCalls: [item.toolCall],
  });
}

export function createTimelineGroups(
  messages: MessageRecord[],
  toolCalls: AgentToolCallRecord[],
  permissions: AgentPermissionRequestRecord[] = [],
  questions: AgentQuestionRequestRecord[] = [],
): TimelineGroup[] {
  const lanes = createTimelineLanes(
    messages,
    toolCalls,
    permissions,
    questions,
  );
  const groups: TimelineGroup[] = [];

  for (
    let item = takeNextTimelineItem(lanes);
    item;
    item = takeNextTimelineItem(lanes)
  ) {
    appendTimelineItem(groups, item);
  }

  return coalesceAdjacentSubagentGroups(groups);
}

function isSubagentOnlyGroup(
  group: TimelineGroup,
): group is Extract<TimelineGroup, { kind: "toolCalls" }> {
  return (
    group.kind === "toolCalls" &&
    group.toolCalls.length > 0 &&
    group.toolCalls.every(isSubagentTimelineCall)
  );
}

export function coalesceAdjacentSubagentGroups(items: TimelineGroup[]) {
  const groups: TimelineGroup[] = [];

  for (const item of items) {
    const last = groups.at(-1);

    if (last && isSubagentOnlyGroup(last) && isSubagentOnlyGroup(item)) {
      groups[groups.length - 1] = {
        ...last,
        toolCalls: [...last.toolCalls, ...item.toolCalls],
      };
      continue;
    }

    groups.push(
      item.kind === "toolCalls"
        ? { ...item, toolCalls: [...item.toolCalls] }
        : item,
    );
  }

  return groups;
}

export function createConversationGroups(timelineGroups: TimelineGroup[]) {
  const conversationGroups: ConversationGroup[] = [];
  let currentGroup: ConversationGroup | null = null;

  for (const timelineGroup of timelineGroups) {
    if (
      timelineGroup.kind === "message" &&
      timelineGroup.message.role === "user"
    ) {
      if (currentGroup) {
        conversationGroups.push(currentGroup);
      }

      currentGroup = {
        id: `conversation-${timelineGroup.id}`,
        items: [],
        prompt: timelineGroup.message,
      };
      continue;
    }

    if (!currentGroup) {
      currentGroup = {
        id: `conversation-${timelineGroup.id}`,
        items: [],
      };
    }

    currentGroup.items.push(timelineGroup);
  }

  if (currentGroup) {
    conversationGroups.push(currentGroup);
  }

  return conversationGroups;
}

export function getVisibleConversationItems(
  conversationGroup: ConversationGroup,
) {
  return conversationGroup.items.filter(
    (item) =>
      item.kind !== "message" ||
      !isAssistantEchoOfPrompt(item.message, conversationGroup.prompt),
  );
}

// A render segment is either a single timeline item rendered as-is, or an
// `activity` run — a contiguous stretch of process (tool calls, reasoning and
// interim replies) folded into one collapsible block for the "condensed" mode.
export type ConversationRenderSegment =
  | { kind: "item"; item: TimelineGroup }
  | { kind: "activity"; items: TimelineGroup[] };

export type TurnPhase = "live" | "completed" | "interrupted";

type TurnEnd = string | null | undefined;

// Process items are the turn's "working" steps — tool calls, reasoning and
// interim replies. Final answers, permissions and questions stay outside:
// answers are the payload, and permission/question cards are interactive.
function isProcessItem(item: TimelineGroup, turnEndMessageId: TurnEnd) {
  if (item.kind === "toolCalls") {
    return true;
  }

  return (
    item.kind === "message" &&
    (isReasoningMessage(item.message) || isInterimReply(item, turnEndMessageId))
  );
}

function isAssistantReply(item: TimelineGroup) {
  return (
    item.kind === "message" &&
    item.message.role === "assistant" &&
    !isReasoningMessage(item.message) &&
    item.message.content.trim().length > 0
  );
}

function isInterimReply(item: TimelineGroup, turnEndMessageId: TurnEnd) {
  return (
    turnEndMessageId !== undefined &&
    item.id !== turnEndMessageId &&
    isAssistantReply(item)
  );
}

function isWorkItem(item: TimelineGroup) {
  return (
    item.kind === "toolCalls" ||
    (item.kind === "message" && isReasoningMessage(item.message))
  );
}

export function getTurnEndMessageId(
  items: TimelineGroup[],
  phase: Exclude<TurnPhase, "live">,
): string | null {
  const replyIndex = items.findLastIndex(isAssistantReply);
  if (replyIndex < 0) {
    return null;
  }
  if (phase === "interrupted" && items.slice(replyIndex + 1).some(isWorkItem)) {
    return null;
  }
  return items[replyIndex]?.id ?? null;
}

export function withoutInterimReplies(
  items: TimelineGroup[],
  phase: Exclude<TurnPhase, "live">,
) {
  const turnEndMessageId = getTurnEndMessageId(items, phase);
  return items.filter((item) => !isInterimReply(item, turnEndMessageId));
}

function isFoldableTrailingItem(item: TimelineGroup) {
  if (item.kind === "toolCalls") {
    return item.toolCalls.every((toolCall) => toolCall.status === "completed");
  }
  return item.kind === "message" && isReasoningMessage(item.message);
}

function moveTrailingWorkBeforeTurnEnd(
  items: TimelineGroup[],
  turnEndMessageId: TurnEnd,
) {
  const turnEndIndex = items.findIndex((item) => item.id === turnEndMessageId);
  if (turnEndIndex < 0) {
    return items;
  }

  const trailingItems = items.slice(turnEndIndex + 1);
  const foldedItems = trailingItems.filter(isFoldableTrailingItem);
  if (foldedItems.length === 0) {
    return items;
  }

  return [
    ...items.slice(0, turnEndIndex),
    ...foldedItems,
    items[turnEndIndex],
    ...trailingItems.filter((item) => !isFoldableTrailingItem(item)),
  ];
}

export function segmentConversationItems(
  items: TimelineGroup[],
  condensed: boolean,
  phase: TurnPhase = "live",
): ConversationRenderSegment[] {
  const coalescedItems = coalesceAdjacentSubagentGroups(items);

  if (!condensed) {
    return coalescedItems.map((item) => ({ kind: "item", item }));
  }

  const turnEndMessageId =
    phase === "live" ? undefined : getTurnEndMessageId(coalescedItems, phase);
  const timelineItems = moveTrailingWorkBeforeTurnEnd(
    coalescedItems,
    turnEndMessageId,
  );
  const segments: ConversationRenderSegment[] = [];
  let run: TimelineGroup[] = [];

  const flushRun = () => {
    if (run.length === 0) {
      return;
    }

    segments.push({ kind: "activity", items: run });
    run = [];
  };

  for (const item of timelineItems) {
    if (isProcessItem(item, turnEndMessageId)) {
      run.push(item);
      continue;
    }

    flushRun();
    segments.push({ kind: "item", item });
  }

  flushRun();
  return segments;
}

export function findConversationTurnStats<T>(
  conversationGroup: ConversationGroup,
  statsByMessageId: Record<string, T>,
): T | undefined {
  for (const item of conversationGroup.items.toReversed()) {
    const stats =
      item.kind === "message" ? statsByMessageId[item.message.id] : undefined;
    if (stats) {
      return stats;
    }
  }
  return conversationGroup.prompt
    ? statsByMessageId[conversationGroup.prompt.id]
    : undefined;
}
