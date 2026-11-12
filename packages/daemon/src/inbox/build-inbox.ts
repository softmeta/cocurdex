import {
  INBOX_FAILURE_KINDS,
  INBOX_NEEDS_YOU_KINDS,
  type InboxForm,
  type InboxItem,
  isPersonalSession,
  type RoutineRecord,
  type RoutineRunRecord,
  routineReportNeedsUser,
  type SessionAttentionSnapshot,
  type SessionRecord,
} from "@cocurdex/shared";

export interface InboxPendingEntry {
  sessionId: string;
  detail: string | null;
  createdAt: string;
}

export interface InboxSources {
  sessions: readonly SessionRecord[];
  delegatedSessionIds: ReadonlySet<string>;
  attention: readonly SessionAttentionSnapshot[];
  pending: {
    permissions: readonly InboxPendingEntry[];
    questions: readonly InboxPendingEntry[];
    planApprovals: readonly InboxPendingEntry[];
  };
  routines: readonly RoutineRecord[];
  latestRuns: ReadonlyMap<string, RoutineRunRecord>;
}

function formOf(session: SessionRecord): InboxForm {
  return isPersonalSession(session) ? "personal" : "work";
}

function rank(item: InboxItem) {
  if (INBOX_NEEDS_YOU_KINDS.includes(item.kind)) return 0;
  if (INBOX_FAILURE_KINDS.includes(item.kind)) return 1;
  return 2;
}

function firstFor(entries: readonly InboxPendingEntry[], sessionId: string) {
  return entries.find((entry) => entry.sessionId === sessionId) ?? null;
}

function isAfter(at: string | null, reference: string | null) {
  if (!at) return false;
  if (!reference) return true;
  return Date.parse(at) > Date.parse(reference);
}

function routineRunItem(run: RoutineRunRecord) {
  if (run.status === "failed") {
    return { kind: "routine-failed" as const, detail: run.error };
  }
  if (routineReportNeedsUser(run.outcome)) {
    return {
      kind: "routine-needs-you" as const,
      detail: run.question ?? run.summary,
    };
  }
  return { kind: "routine-result" as const, detail: run.summary };
}

export function buildInbox(sources: InboxSources): InboxItem[] {
  const attention = new Map(
    sources.attention.map((entry) => [entry.sessionId, entry]),
  );
  const routineSessions = new Set(
    sources.routines.flatMap((routine) =>
      routine.sessionId ? [routine.sessionId] : [],
    ),
  );
  const items: InboxItem[] = [];

  for (const session of sources.sessions) {
    if (session.archivedAt) continue;
    if (
      !isPersonalSession(session) &&
      !sources.delegatedSessionIds.has(session.id)
    ) {
      continue;
    }
    const base = {
      id: `session:${session.id}`,
      form: formOf(session),
      sessionId: session.id,
      workspaceId: session.workspaceId,
      routineId: null,
      runId: null,
      title: session.title,
    };
    const permission = firstFor(sources.pending.permissions, session.id);
    const question = firstFor(sources.pending.questions, session.id);
    const plan = firstFor(sources.pending.planApprovals, session.id);
    const waiting =
      (permission && { kind: "approval" as const, entry: permission }) ??
      (question && { kind: "question" as const, entry: question }) ??
      (plan && { kind: "plan" as const, entry: plan });
    if (waiting) {
      items.push({
        ...base,
        kind: waiting.kind,
        detail: waiting.entry.detail,
        at: waiting.entry.createdAt,
      });
      continue;
    }
    if (routineSessions.has(session.id)) continue;
    const state = attention.get(session.id);
    if (!state) continue;
    const at = state.latestResultAt ?? session.updatedAt;
    if (state.runtimeState === "failed") {
      items.push({ ...base, kind: "failed", detail: null, at });
    } else if (
      state.attentionState === "completed-unread" &&
      !sources.delegatedSessionIds.has(session.id)
    ) {
      items.push({ ...base, kind: "completed", detail: null, at });
    }
  }

  for (const routine of sources.routines) {
    const base = {
      id: `routine:${routine.id}`,
      form: "personal" as const,
      sessionId: routine.sessionId,
      workspaceId: null,
      routineId: routine.id,
      title: routine.name,
    };
    const run = sources.latestRuns.get(routine.id) ?? null;
    if (routine.pausedReason === "failures") {
      items.push({
        ...base,
        kind: "routine-paused",
        runId: run?.id ?? null,
        detail: run?.error ?? null,
        at: routine.updatedAt,
      });
      continue;
    }
    if (!run?.finishedAt || run.outcome === "dropped") continue;
    const result = routineRunItem(run);
    if (routine.deliver === "silent" && result.kind !== "routine-needs-you") {
      continue;
    }
    const seen = run.sessionId ? attention.get(run.sessionId) : undefined;
    if (seen?.resultDisposition === "settled") continue;
    if (!isAfter(run.finishedAt, seen?.lastVisitedAt ?? null)) continue;
    items.push({
      ...base,
      ...result,
      runId: run.id,
      sessionId: run.sessionId ?? routine.sessionId,
      at: run.finishedAt,
    });
  }

  return items.sort(
    (left, right) =>
      rank(left) - rank(right) || Date.parse(right.at) - Date.parse(left.at),
  );
}
