import type { InboxItem } from "./inbox";

export interface BriefRoutineResult {
  routineId: string;
  routineName: string;
  agentId: string;
  runId: string;
  sessionId: string | null;
  summary: string;
  at: string;
}

export interface Brief {
  day: string;
  timeZone: string;
  updatedAt: string;
  needsYou: InboxItem[];
  results: BriefRoutineResult[];
  failures: InboxItem[];
}

export const BRIEF_AWAY_MS = 3 * 60 * 60 * 1000;

export function briefEntryAfterAway(awayMs: number) {
  return awayMs >= BRIEF_AWAY_MS;
}

export function briefDue(brief: Brief | null, shownUpdatedAt: string | null) {
  if (!brief) return false;
  return shownUpdatedAt === null || brief.updatedAt > shownUpdatedAt;
}
