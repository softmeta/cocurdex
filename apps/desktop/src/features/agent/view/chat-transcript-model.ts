import type {
  AgentPermissionRequestRecord,
  AgentQuestionRequestRecord,
  AgentToolCallRecord,
  MessageRecord,
} from "@cocurdex/shared";
import {
  type ConversationGroup,
  createConversationGroups,
  createTimelineGroups,
  type TimelineGroup,
} from "./chat-timeline";

const EMPTY_PERMISSIONS: AgentPermissionRequestRecord[] = [];

export type TranscriptModel = {
  conversationGroups: ConversationGroup[];
  timelineGroups: TimelineGroup[];
};

type TranscriptCacheEntry = {
  messages: MessageRecord[];
  toolCalls: AgentToolCallRecord[];
  questions: AgentQuestionRequestRecord[];
  model: TranscriptModel;
};

// Per-session structural cache. The previous WeakMap chain keyed off the
// `messages` array identity, but `messagesBySessionAtom` allocates a fresh
// array on every streaming delta, so every token forced a full rebuild of
// timeline/conversation groups (O(N) over the whole transcript) — and every
// ChatConversationItem received a new prop reference, defeating React.memo.
//
// This cache reuses prefix references aggressively. Hot path: streaming tail
// patch (same length, only the last message's content grew). We replace just
// the last timeline group and the last conversation group's last item; every
// other group keeps its previous reference so memoized children skip render.
const transcriptModelCache = new Map<string, TranscriptCacheEntry>();
const FALLBACK_CACHE_KEY = "__no_session__";
const TRANSCRIPT_MODEL_CACHE_MAX_ENTRIES = 100;

function touchTranscriptCacheEntry(
  cacheKey: string,
  entry: TranscriptCacheEntry,
) {
  transcriptModelCache.delete(cacheKey);
  transcriptModelCache.set(cacheKey, entry);
  while (transcriptModelCache.size > TRANSCRIPT_MODEL_CACHE_MAX_ENTRIES) {
    const oldestKey = transcriptModelCache.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }
    transcriptModelCache.delete(oldestKey);
  }
}

function buildTranscriptModel(
  messages: MessageRecord[],
  toolCalls: AgentToolCallRecord[],
  questions: AgentQuestionRequestRecord[],
): TranscriptModel {
  const timelineGroups = createTimelineGroups(
    messages,
    toolCalls,
    EMPTY_PERMISSIONS,
    questions,
  );
  return {
    conversationGroups: createConversationGroups(timelineGroups),
    timelineGroups,
  };
}

// Detect the "streaming tokens appended" case: only a trailing run of message
// references changed (their content grew), everything else identical. A single
// flush can grow several tail messages at once — typically a reasoning block
// and the response streaming in the same 16ms window — so the patch accepts
// any changed suffix, not just the last message. Returns the index where the
// changed suffix starts, or null when the model must be fully rebuilt.
function getPatchableSuffixStart(
  prev: TranscriptCacheEntry,
  messages: MessageRecord[],
  toolCalls: AgentToolCallRecord[],
  questions: AgentQuestionRequestRecord[],
): number | null {
  if (prev.toolCalls !== toolCalls) return null;
  if (prev.questions !== questions) return null;
  if (prev.messages.length !== messages.length) return null;
  if (messages.length === 0) return null;

  let start = 0;
  while (start < messages.length && prev.messages[start] === messages[start]) {
    start++;
  }
  if (start === messages.length) return null;
  for (let i = start; i < messages.length; i++) {
    if (prev.messages[i].id !== messages[i].id) return null;
  }

  // The changed messages must be exactly the trailing timeline groups, in
  // order, and the trailing items of the last conversation group (not its
  // `prompt`, which would mean we're streaming a user prompt — atypical but
  // bail to full rebuild for correctness).
  const changedCount = messages.length - start;
  const timeline = prev.model.timelineGroups;
  if (timeline.length < changedCount) return null;
  for (let i = 0; i < changedCount; i++) {
    const group = timeline[timeline.length - changedCount + i];
    if (group.kind !== "message" || group.id !== messages[start + i].id) {
      return null;
    }
  }
  const lastConv = prev.model.conversationGroups.at(-1);
  if (!lastConv || lastConv.items.length < changedCount) return null;
  for (let i = 0; i < changedCount; i++) {
    const item = lastConv.items[lastConv.items.length - changedCount + i];
    if (item.kind !== "message" || item.id !== messages[start + i].id) {
      return null;
    }
  }
  return start;
}

function patchStreamingTail(
  prev: TranscriptCacheEntry,
  messages: MessageRecord[],
  suffixStart: number,
): TranscriptModel {
  const newGroups: TimelineGroup[] = messages
    .slice(suffixStart)
    .map((message) => ({ id: message.id, kind: "message", message }));

  const prevTimeline = prev.model.timelineGroups;
  const newTimelineGroups = [
    ...prevTimeline.slice(0, prevTimeline.length - newGroups.length),
    ...newGroups,
  ];

  const prevConv = prev.model.conversationGroups;
  // getPatchableSuffixStart already validated structure.
  const lastConv = prevConv[prevConv.length - 1];
  const newItems = [
    ...lastConv.items.slice(0, lastConv.items.length - newGroups.length),
    ...newGroups,
  ];
  const newLastConv: ConversationGroup = { ...lastConv, items: newItems };
  const newConversationGroups = [...prevConv.slice(0, -1), newLastConv];

  return {
    timelineGroups: newTimelineGroups,
    conversationGroups: newConversationGroups,
  };
}

export function getCachedTranscriptModel(
  sessionId: string | null,
  messages: MessageRecord[],
  toolCalls: AgentToolCallRecord[],
  questions: AgentQuestionRequestRecord[],
): TranscriptModel {
  const cacheKey = sessionId ?? FALLBACK_CACHE_KEY;
  const prev = transcriptModelCache.get(cacheKey);

  if (
    prev &&
    prev.messages === messages &&
    prev.toolCalls === toolCalls &&
    prev.questions === questions
  ) {
    touchTranscriptCacheEntry(cacheKey, prev);
    return prev.model;
  }

  let model: TranscriptModel;
  const suffixStart = prev
    ? getPatchableSuffixStart(prev, messages, toolCalls, questions)
    : null;
  if (prev && suffixStart !== null) {
    model = patchStreamingTail(prev, messages, suffixStart);
  } else {
    model = buildTranscriptModel(messages, toolCalls, questions);
  }

  touchTranscriptCacheEntry(cacheKey, {
    messages,
    toolCalls,
    questions,
    model,
  });
  return model;
}
