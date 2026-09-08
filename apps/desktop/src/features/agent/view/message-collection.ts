import type { MessageRecord } from "@cocurdex/shared";

type CollectionIndex = {
  positions: Map<string, number>;
  revision: object;
  previousRevision?: object;
  firstChangedIndex?: number;
};

const indexes = new WeakMap<MessageRecord[], CollectionIndex>();

function getIndex(messages: MessageRecord[]): CollectionIndex {
  const cached = indexes.get(messages);
  if (cached) {
    return cached;
  }
  const positions = new Map<string, number>();
  for (let index = 0; index < messages.length; index++) {
    if (!positions.has(messages[index].id)) {
      positions.set(messages[index].id, index);
    }
  }
  const entry = { positions, revision: {} };
  indexes.set(messages, entry);
  return entry;
}

export function findMessageById(messages: MessageRecord[], id: string) {
  const index = getIndex(messages).positions.get(id);
  return index === undefined ? undefined : messages[index];
}

export function upsertMessages(
  messages: MessageRecord[],
  updates: MessageRecord[],
): MessageRecord[] {
  if (updates.length === 0) {
    return messages;
  }
  const previous = getIndex(messages);
  let positions = previous.positions;
  const next = messages.slice();
  let firstChangedIndex = messages.length;

  for (const message of updates) {
    const index = positions.get(message.id);
    if (index === undefined) {
      if (positions === previous.positions) {
        positions = new Map(positions);
      }
      positions.set(message.id, next.length);
      next.push(message);
      continue;
    }
    firstChangedIndex = Math.min(firstChangedIndex, index);
    next[index] = { ...message, createdAt: next[index].createdAt };
  }

  indexes.set(next, {
    positions,
    revision: {},
    previousRevision: previous.revision,
    firstChangedIndex,
  });
  return next;
}

export function getFirstChangedMessageIndex(
  previous: MessageRecord[],
  messages: MessageRecord[],
) {
  const previousIndex = indexes.get(previous);
  const currentIndex = indexes.get(messages);
  if (
    previousIndex &&
    currentIndex?.previousRevision === previousIndex.revision &&
    currentIndex.firstChangedIndex !== undefined
  ) {
    return currentIndex.firstChangedIndex;
  }

  let index = 0;
  while (index < messages.length && previous[index] === messages[index]) {
    index++;
  }
  return index;
}
