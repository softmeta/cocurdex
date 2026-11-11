import type {
  SessionObservationSnapshot,
  SessionTranscriptPage,
} from "@cocurdex/shared";

export function mergeOlderBoundary(
  current: number | null | undefined,
  next: number | null,
) {
  if (current === undefined) return next;
  if (current === null || next === null) return null;
  return Math.min(current, next);
}

function prependUnique<T extends { id: string }>(
  older: readonly T[],
  newer: readonly T[],
) {
  const newerIds = new Set(newer.map((item) => item.id));
  return [...older.filter((item) => !newerIds.has(item.id)), ...newer];
}

function before<T extends { seq?: number }>(items: readonly T[], seq: number) {
  return items.filter((item) => item.seq !== undefined && item.seq < seq);
}

export function keepOlderPages(
  previous: SessionObservationSnapshot | null,
  next: SessionObservationSnapshot,
): SessionObservationSnapshot {
  const windowStart = next.olderBeforeSeq;
  if (!previous || windowStart === null) return next;
  if (previous.olderBeforeSeq === windowStart) return next;
  return {
    ...next,
    messages: prependUnique(
      before(previous.messages, windowStart),
      next.messages,
    ),
    toolCalls: prependUnique(
      before(previous.toolCalls, windowStart),
      next.toolCalls,
    ),
    turnChangeSets: { ...previous.turnChangeSets, ...next.turnChangeSets },
    olderBeforeSeq: mergeOlderBoundary(previous.olderBeforeSeq, windowStart),
  };
}

export function prependTranscriptPage(
  observation: SessionObservationSnapshot,
  page: SessionTranscriptPage,
): SessionObservationSnapshot {
  return {
    ...observation,
    messages: prependUnique(page.messages, observation.messages),
    toolCalls: prependUnique(page.toolCalls, observation.toolCalls),
    turnChangeSets: { ...page.turnChangeSets, ...observation.turnChangeSets },
    olderBeforeSeq: mergeOlderBoundary(
      observation.olderBeforeSeq,
      page.olderBeforeSeq,
    ),
  };
}

export function joinTranscriptPages(
  older: SessionTranscriptPage,
  newer: SessionTranscriptPage,
): SessionTranscriptPage {
  return {
    messages: prependUnique(older.messages, newer.messages),
    toolCalls: prependUnique(older.toolCalls, newer.toolCalls),
    turnStats: { ...older.turnStats, ...newer.turnStats },
    turnChangeSets: { ...older.turnChangeSets, ...newer.turnChangeSets },
    olderBeforeSeq: older.olderBeforeSeq,
  };
}
