import { defaultRangeExtractor, type Range } from "@tanstack/react-virtual";
import type { ConversationGroup } from "../chat-timeline";

export const CONVERSATION_ESTIMATED_HEIGHT = 480;
export const MESSAGE_SCROLL_INSET = 20;

export function createConversationLookup(groups: ConversationGroup[]) {
  const byId = new Map<string, number>();
  const byMessageId = new Map<string, number>();
  const promptIndexes: number[] = [];
  groups.forEach((group, index) => {
    byId.set(group.id, index);
    if (group.prompt) {
      byMessageId.set(group.prompt.id, index);
      promptIndexes.push(index);
    }
  });
  return { byId, byMessageId, promptIndexes };
}

export function getConversationWindow(
  range: Range,
  pinnedIndexes: number[],
  selectedRange: [number, number] | null,
) {
  const indexes = new Set(defaultRangeExtractor(range));
  for (const index of pinnedIndexes) {
    if (index >= 0 && index < range.count) indexes.add(index);
  }
  if (selectedRange) {
    const start = Math.max(0, Math.min(...selectedRange));
    const end = Math.min(range.count - 1, Math.max(...selectedRange));
    for (let index = start; index <= end; index += 1) indexes.add(index);
  }
  return [...indexes].sort((left, right) => left - right);
}

export function getAdjacentPromptIndexes(
  promptIndexes: number[],
  conversationIndex: number,
) {
  let start = 0;
  let end = promptIndexes.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (promptIndexes[middle] <= conversationIndex) start = middle + 1;
    else end = middle;
  }
  return promptIndexes.slice(Math.max(0, start - 2), start + 1);
}

export function getMessageScrollTop(
  scrollTop: number,
  relativeTop: number,
  scrollHeight: number,
  viewportHeight: number,
) {
  return Math.max(
    0,
    Math.min(
      scrollTop + relativeTop - MESSAGE_SCROLL_INSET,
      scrollHeight - viewportHeight,
    ),
  );
}
