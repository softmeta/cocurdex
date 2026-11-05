import {
  type Brief,
  type BriefRoutineResult,
  INBOX_FAILURE_KINDS,
  INBOX_NEEDS_YOU_KINDS,
  type InboxItem,
  type RoutineRecord,
  type RoutineRunRecord,
} from "@cocurdex/shared";

export interface BriefSources {
  day: string;
  timeZone: string;
  inbox: InboxItem[];
  routines: RoutineRecord[];
  runsToday: RoutineRunRecord[];
}

function latestResults(
  routines: RoutineRecord[],
  runsToday: RoutineRunRecord[],
) {
  const byId = new Map(routines.map((routine) => [routine.id, routine]));
  const results = new Map<string, BriefRoutineResult>();
  for (const run of runsToday) {
    const routine = byId.get(run.routineId);
    if (!routine || routine.deliver === "silent") continue;
    if (run.status !== "succeeded" || !run.summary || !run.finishedAt) {
      continue;
    }
    const current = results.get(routine.id);
    if (current && current.at >= run.finishedAt) continue;
    results.set(routine.id, {
      routineId: routine.id,
      routineName: routine.name,
      agentId: routine.agentId,
      runId: run.id,
      sessionId: run.sessionId,
      summary: run.summary,
      at: run.finishedAt,
    });
  }
  return [...results.values()].sort((left, right) =>
    right.at.localeCompare(left.at),
  );
}

export function buildBrief(sources: BriefSources): Brief | null {
  const needsYou = sources.inbox.filter((item) =>
    INBOX_NEEDS_YOU_KINDS.includes(item.kind),
  );
  const failures = sources.inbox.filter((item) =>
    INBOX_FAILURE_KINDS.includes(item.kind),
  );
  const results = latestResults(sources.routines, sources.runsToday);
  const stamps = [
    ...needsYou.map((item) => item.at),
    ...failures.map((item) => item.at),
    ...results.map((result) => result.at),
  ];
  const updatedAt = stamps.sort().at(-1);
  if (!updatedAt) return null;
  return {
    day: sources.day,
    timeZone: sources.timeZone,
    updatedAt,
    needsYou,
    results,
    failures,
  };
}
