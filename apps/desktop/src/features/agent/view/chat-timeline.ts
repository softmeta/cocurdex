import type {
  AgentPermissionRequestRecord,
  AgentQuestionRequestRecord,
  AgentToolCallRecord,
  MessageRecord,
} from "@cocurdex/shared";
import {
  isAssistantEchoOfPrompt,
  isReasoningMessage,
} from "./chat-message-utils";

type TimelineItem =
  | {
      id: string;
      sortAt: string;
      order: number;
      kind: "message";
      message: MessageRecord;
    }
  | {
      id: string;
      sortAt: string;
      order: number;
      kind: "toolCall";
      toolCall: AgentToolCallRecord;
    }
  | {
      id: string;
      sortAt: string;
      order: number;
      kind: "permission";
      permission: AgentPermissionRequestRecord;
    }
  | {
      id: string;
      sortAt: string;
      order: number;
      kind: "question";
      question: AgentQuestionRequestRecord;
    };

type TimelineCursor = {
  index: number;
  kind: TimelineItem["kind"];
  priority: number;
  length: number;
};

const HIDDEN_TOOL_KINDS = new Set(["todowrite"]);
// Mirrors `isOpenCodeSubagentToolCall` in tool-call-utils. Inlined here to keep
// the timeline builder free of a tool-call → view dependency cycle.
const SUBAGENT_TOOL_KIND = "task";

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

function getTimelineCursorItem(
  cursor: TimelineCursor,
  messages: MessageRecord[],
  toolCalls: AgentToolCallRecord[],
  permissions: AgentPermissionRequestRecord[],
  questions: AgentQuestionRequestRecord[],
): TimelineItem {
  if (cursor.kind === "message") {
    const message = messages[cursor.index];
    return {
      id: message.id,
      kind: "message",
      sortAt: message.createdAt,
      order: cursor.index,
      message,
    };
  }

  if (cursor.kind === "toolCall") {
    const toolCall = toolCalls[cursor.index];
    return {
      id: toolCall.id,
      kind: "toolCall",
      sortAt: toolCall.startedAt,
      order: cursor.index,
      toolCall,
    };
  }

  if (cursor.kind === "permission") {
    const permission = permissions[cursor.index];
    return {
      id: permission.id,
      kind: "permission",
      sortAt: permission.createdAt,
      order: cursor.index,
      permission,
    };
  }

  const question = questions[cursor.index];
  return {
    id: question.id,
    kind: "question",
    sortAt: question.createdAt,
    order: cursor.index,
    question,
  };
}

function getNextTimelineCursor(
  cursors: TimelineCursor[],
  messages: MessageRecord[],
  toolCalls: AgentToolCallRecord[],
  permissions: AgentPermissionRequestRecord[],
  questions: AgentQuestionRequestRecord[],
) {
  let nextCursor: TimelineCursor | null = null;
  let nextItem: TimelineItem | null = null;

  for (const cursor of cursors) {
    if (cursor.index >= cursor.length) {
      continue;
    }

    const item = getTimelineCursorItem(
      cursor,
      messages,
      toolCalls,
      permissions,
      questions,
    );

    if (
      !nextItem ||
      item.sortAt < nextItem.sortAt ||
      (item.sortAt === nextItem.sortAt &&
        (cursor.priority < (nextCursor?.priority ?? Number.MAX_SAFE_INTEGER) ||
          (cursor.priority === nextCursor?.priority &&
            item.order < nextItem.order)))
    ) {
      nextCursor = cursor;
      nextItem = item;
    }
  }

  return nextCursor && nextItem ? { cursor: nextCursor, item: nextItem } : null;
}

// Subagent (task) calls render as standalone cards, so they never coalesce
// with neighbours. Every other tool call merges into a single collapsible
// activity block to keep the timeline from drowning in one-call rows.
function isMergeableToolCall(toolCall: AgentToolCallRecord) {
  return toolCall.kind !== SUBAGENT_TOOL_KIND;
}

function appendTimelineItem(groups: TimelineGroup[], item: TimelineItem) {
  if (item.kind === "message") {
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

  const lastGroup = groups.at(-1);

  if (
    lastGroup?.kind === "toolCalls" &&
    isMergeableToolCall(item.toolCall) &&
    lastGroup.toolCalls.every(isMergeableToolCall)
  ) {
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
  const cursors: TimelineCursor[] = [
    { index: 0, kind: "message", length: messages.length, priority: 0 },
    { index: 0, kind: "toolCall", length: toolCalls.length, priority: 1 },
    { index: 0, kind: "permission", length: permissions.length, priority: 2 },
    { index: 0, kind: "question", length: questions.length, priority: 3 },
  ];
  const groups: TimelineGroup[] = [];

  while (true) {
    const next = getNextTimelineCursor(
      cursors,
      messages,
      toolCalls,
      permissions,
      questions,
    );

    if (!next) {
      break;
    }

    appendTimelineItem(groups, next.item);
    next.cursor.index += 1;
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
// `activity` run — a contiguous stretch of pre-answer process (tool-call groups
// and reasoning) folded into one collapsible block for the "condensed" mode.
export type ConversationRenderSegment =
  | { kind: "item"; item: TimelineGroup }
  | { kind: "activity"; items: TimelineGroup[] };

// Process items are the turn's "working" steps — tool calls and reasoning.
// Answers, permissions and questions stay outside the activity block: answers
// are the payload, and permission/question cards are interactive.
function isProcessItem(item: TimelineGroup) {
  if (item.kind === "toolCalls") {
    return true;
  }

  return item.kind === "message" && isReasoningMessage(item.message);
}

export function segmentConversationItems(
  items: TimelineGroup[],
  condensed: boolean,
): ConversationRenderSegment[] {
  if (!condensed) {
    return items.map((item) => ({ kind: "item", item }));
  }

  const segments: ConversationRenderSegment[] = [];
  let run: TimelineGroup[] = [];

  const flushRun = () => {
    if (run.length === 0) {
      return;
    }

    segments.push({ kind: "activity", items: run });
    run = [];
  };

  for (const item of items) {
    if (isProcessItem(item)) {
      run.push(item);
      continue;
    }

    flushRun();
    segments.push({ kind: "item", item });
  }

  flushRun();
  return segments;
}
