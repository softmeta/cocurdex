import type { SessionRecord } from "@cocurdex/shared";

export const SEARCH_CATEGORIES = [
  "all",
  "sessions",
  "files",
  "notes",
  "issues",
] as const;

export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export function cycleSearchCategory(
  current: SearchCategory,
  direction: 1 | -1,
): SearchCategory {
  const count = SEARCH_CATEGORIES.length;
  const index = SEARCH_CATEGORIES.indexOf(current);
  return SEARCH_CATEGORIES[(index + direction + count) % count];
}

function sessionActivityAt(session: SessionRecord) {
  return session.lastMessageAt ?? session.updatedAt;
}

function byRecentActivity(left: SessionRecord, right: SessionRecord) {
  return sessionActivityAt(right).localeCompare(sessionActivityAt(left));
}

export function rankSessions(
  sessions: readonly SessionRecord[],
  query: string,
  limit: number,
): SessionRecord[] {
  const needle = query.trim().toLowerCase();
  const mainSessions = sessions.filter(
    (session) => session.sessionKind !== "subagent",
  );
  if (!needle) {
    return mainSessions.sort(byRecentActivity).slice(0, limit);
  }

  const prefixMatches: SessionRecord[] = [];
  const otherMatches: SessionRecord[] = [];
  for (const session of mainSessions) {
    const title = session.title.toLowerCase();
    if (title.startsWith(needle)) {
      prefixMatches.push(session);
    } else if (title.includes(needle)) {
      otherMatches.push(session);
    }
  }
  return [
    ...prefixMatches.sort(byRecentActivity),
    ...otherMatches.sort(byRecentActivity),
  ].slice(0, limit);
}
