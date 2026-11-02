import type { CocurdexDaemonEvent } from "@cocurdex/shared";

const SESSION_DETAIL_EVENTS = new Set<CocurdexDaemonEvent["type"]>([
  "message.delta",
  "message.completed",
  "tool.started",
  "tool.updated",
  "tool.finished",
  "usage.updated",
  "context_breakdown.updated",
]);

export const MAX_WATCHED_SESSIONS = 64;

export type WatchedSessions = ReadonlySet<string> | null;

export function normalizeWatchedSessions(value: unknown): WatchedSessions {
  if (!Array.isArray(value)) return null;
  const sessionIds = value.filter(
    (sessionId): sessionId is string =>
      typeof sessionId === "string" &&
      sessionId.length > 0 &&
      sessionId.length <= 128,
  );
  return new Set(sessionIds.slice(0, MAX_WATCHED_SESSIONS));
}

export function deliversToWatcher(
  event: CocurdexDaemonEvent,
  watched: WatchedSessions,
) {
  if (watched === null || !SESSION_DETAIL_EVENTS.has(event.type)) return true;
  return "sessionId" in event && watched.has(event.sessionId);
}
