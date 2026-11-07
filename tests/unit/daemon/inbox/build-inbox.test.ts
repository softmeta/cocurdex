import { buildInbox } from "@cocurdex/daemon/internal/inbox/build-inbox";
import type {
  RoutineRecord,
  RoutineRunRecord,
  SessionAttentionSnapshot,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function session(
  id: string,
  extra: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id,
    workspaceId: "w1",
    title: id,
    sessionKind: "main",
    updatedAt: "2026-11-05T08:00:00.000Z",
    archivedAt: null,
    ...extra,
  } as SessionRecord;
}

function personalSession(id: string) {
  return session(id, { sessionKind: "personal", workspaceId: "personal" });
}

function attention(
  sessionId: string,
  extra: Partial<SessionAttentionSnapshot>,
): SessionAttentionSnapshot {
  return {
    sessionId,
    runtimeState: "ready",
    attentionState: "none",
    primaryState: "ready",
    activityKind: null,
    connectionPending: false,
    latestResultAt: null,
    lastVisitedAt: null,
    resultDisposition: "automatic",
    updatedAt: "2026-11-05T08:00:00.000Z",
    ...extra,
  };
}

function routine(id: string, extra: Partial<RoutineRecord> = {}) {
  return {
    id,
    agentId: "coach",
    name: id,
    sessionId: `${id}-thread`,
    deliver: "inbox",
    pausedReason: null,
    updatedAt: "2026-11-05T07:00:00.000Z",
    ...extra,
  } as RoutineRecord;
}

function run(routineId: string, extra: Partial<RoutineRunRecord> = {}) {
  return {
    id: `${routineId}-run`,
    routineId,
    sessionId: `${routineId}-thread`,
    trigger: "schedule",
    status: "succeeded",
    summary: "All good",
    error: null,
    outcome: null,
    question: null,
    startedAt: "2026-11-05T06:59:00.000Z",
    finishedAt: "2026-11-05T07:00:00.000Z",
    ...extra,
  } as RoutineRunRecord;
}

const noPending = { permissions: [], questions: [], planApprovals: [] };

describe("buildInbox", () => {
  it("puts what needs the user first, then failures, then results, newest first", () => {
    const items = buildInbox({
      delegatedSessionIds: new Set<string>(),
      sessions: [
        personalSession("done"),
        personalSession("broken"),
        personalSession("asking"),
        personalSession("approve"),
      ],
      attention: [
        attention("done", {
          attentionState: "completed-unread",
          latestResultAt: "2026-11-05T09:00:00.000Z",
        }),
        attention("broken", {
          runtimeState: "failed",
          latestResultAt: "2026-11-05T08:30:00.000Z",
        }),
      ],
      pending: {
        permissions: [
          {
            sessionId: "approve",
            detail: "Run npm test",
            createdAt: "2026-11-05T08:10:00.000Z",
          },
        ],
        questions: [
          {
            sessionId: "asking",
            detail: "Which day?",
            createdAt: "2026-11-05T08:20:00.000Z",
          },
        ],
        planApprovals: [],
      },
      routines: [],
      latestRuns: new Map(),
    });

    expect(
      items.map((item) => [item.kind, item.sessionId, item.form, item.detail]),
    ).toEqual([
      ["question", "asking", "personal", "Which day?"],
      ["approval", "approve", "personal", "Run npm test"],
      ["failed", "broken", "personal", null],
      ["completed", "done", "personal", null],
    ]);
  });

  it("reports a routine's latest result once and drops it after the thread is visited", () => {
    const sources = {
      delegatedSessionIds: new Set<string>(),
      sessions: [session("brief-thread", { sessionKind: "personal" })],
      pending: noPending,
      routines: [routine("brief")],
      latestRuns: new Map([["brief", run("brief")]]),
    };
    const unread = buildInbox({
      ...sources,
      attention: [
        attention("brief-thread", {
          attentionState: "completed-unread",
          latestResultAt: "2026-11-05T07:00:00.000Z",
        }),
      ],
    });
    expect(unread).toEqual([
      expect.objectContaining({
        kind: "routine-result",
        routineId: "brief",
        sessionId: "brief-thread",
        detail: "All good",
      }),
    ]);

    const visited = buildInbox({
      ...sources,
      attention: [
        attention("brief-thread", {
          lastVisitedAt: "2026-11-05T07:05:00.000Z",
        }),
      ],
    });
    expect(visited).toEqual([]);
  });

  it("shows routine failures and auto-pauses but keeps silent routines out", () => {
    const items = buildInbox({
      delegatedSessionIds: new Set<string>(),
      sessions: [],
      attention: [],
      pending: noPending,
      routines: [
        routine("flaky"),
        routine("stuck", { pausedReason: "failures" }),
        routine("quiet", { deliver: "silent" }),
      ],
      latestRuns: new Map([
        ["flaky", run("flaky", { status: "failed", error: "Timed out" })],
        ["stuck", run("stuck", { status: "failed", error: "No model" })],
        ["quiet", run("quiet")],
      ]),
    });
    expect(
      items.map((item) => [item.kind, item.routineId, item.detail]),
    ).toEqual(
      expect.arrayContaining([
        ["routine-failed", "flaky", "Timed out"],
        ["routine-paused", "stuck", "No model"],
      ]),
    );
    expect(items).toHaveLength(2);
  });

  it("asks the user about a run that needs them even when silent, and hides dropped runs", () => {
    const items = buildInbox({
      delegatedSessionIds: new Set<string>(),
      sessions: [],
      attention: [],
      pending: noPending,
      routines: [
        routine("ask", { deliver: "silent" }),
        routine("blocked"),
        routine("nothing"),
      ],
      latestRuns: new Map([
        [
          "ask",
          run("ask", { outcome: "needs_you", question: "Send the reply?" }),
        ],
        [
          "blocked",
          run("blocked", { outcome: "blocked", summary: "No access" }),
        ],
        ["nothing", run("nothing", { outcome: "dropped" })],
      ]),
    });
    expect(
      items.map((item) => [item.kind, item.routineId, item.detail]),
    ).toEqual(
      expect.arrayContaining([
        ["routine-needs-you", "ask", "Send the reply?"],
        ["routine-needs-you", "blocked", "No access"],
      ]),
    );
    expect(items).toHaveLength(2);
  });

  it("leaves work and chat sessions to their own modes", () => {
    const items = buildInbox({
      delegatedSessionIds: new Set<string>(),
      sessions: [session("work"), session("chat", { sessionKind: "chat" })],
      attention: [
        attention("work", { runtimeState: "failed" }),
        attention("chat", { attentionState: "completed-unread" }),
      ],
      pending: {
        permissions: [
          {
            sessionId: "work",
            detail: "Run npm test",
            createdAt: "2026-11-05T08:10:00.000Z",
          },
        ],
        questions: [],
        planApprovals: [],
      },
      routines: [],
      latestRuns: new Map(),
    });
    expect(items).toEqual([]);
  });

  it("keeps work the persona delegated, so its approvals reach the user", () => {
    const items = buildInbox({
      delegatedSessionIds: new Set(["delegated"]),
      sessions: [session("delegated")],
      attention: [],
      pending: {
        permissions: [
          {
            sessionId: "delegated",
            detail: "Run npm test",
            createdAt: "2026-11-05T08:10:00.000Z",
          },
        ],
        questions: [],
        planApprovals: [],
      },
      routines: [],
      latestRuns: new Map(),
    });
    expect(items.map((item) => [item.kind, item.form])).toEqual([
      ["approval", "work"],
    ]);
  });

  it("ignores archived sessions and subagents", () => {
    const items = buildInbox({
      delegatedSessionIds: new Set<string>(),
      sessions: [
        session("old", {
          sessionKind: "personal",
          archivedAt: "2026-11-01T00:00:00.000Z",
        }),
        session("child", { sessionKind: "subagent" }),
      ],
      attention: [
        attention("old", { runtimeState: "failed" }),
        attention("child", { attentionState: "completed-unread" }),
      ],
      pending: noPending,
      routines: [],
      latestRuns: new Map(),
    });
    expect(items).toEqual([]);
  });
});
