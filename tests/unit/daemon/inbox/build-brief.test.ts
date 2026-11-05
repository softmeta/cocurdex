import { buildBrief } from "@cocurdex/daemon/internal/inbox/build-brief";
import type {
  InboxItem,
  RoutineRecord,
  RoutineRunRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function item(id: string, kind: InboxItem["kind"], at: string): InboxItem {
  return {
    id,
    kind,
    form: "work",
    sessionId: id,
    workspaceId: "w1",
    routineId: null,
    runId: null,
    title: id,
    detail: null,
    at,
  };
}

function routine(id: string, extra: Partial<RoutineRecord> = {}) {
  return {
    id,
    agentId: "coach",
    name: `Routine ${id}`,
    deliver: "inbox",
    ...extra,
  } as RoutineRecord;
}

function run(routineId: string, finishedAt: string, extra = {}) {
  return {
    id: `${routineId}-${finishedAt}`,
    routineId,
    sessionId: `${routineId}-thread`,
    status: "succeeded",
    summary: `Summary at ${finishedAt}`,
    finishedAt,
    ...extra,
  } as RoutineRunRecord;
}

const day = { day: "2026-11-05", timeZone: "UTC" };

describe("buildBrief", () => {
  it("is empty when nothing needs the user and no routine reported today", () => {
    expect(
      buildBrief({
        ...day,
        inbox: [item("done", "completed", "2026-11-05T08:00:00.000Z")],
        routines: [routine("quiet", { deliver: "silent" })],
        runsToday: [run("quiet", "2026-11-05T07:00:00.000Z")],
      }),
    ).toBeNull();
  });

  it("groups what needs the user, each routine's latest result today, and failures", () => {
    const brief = buildBrief({
      ...day,
      inbox: [
        item("approve", "approval", "2026-11-05T09:00:00.000Z"),
        item("broken", "failed", "2026-11-05T08:00:00.000Z"),
        item("finished", "completed", "2026-11-05T10:00:00.000Z"),
      ],
      routines: [routine("brief"), routine("weekly")],
      runsToday: [
        run("brief", "2026-11-05T09:30:00.000Z"),
        run("weekly", "2026-11-05T09:45:00.000Z", {
          status: "failed",
          summary: null,
        }),
        run("brief", "2026-11-05T07:00:00.000Z"),
        run("deleted", "2026-11-05T09:50:00.000Z"),
      ],
    });

    expect(brief).toMatchObject({
      day: "2026-11-05",
      updatedAt: "2026-11-05T09:30:00.000Z",
      needsYou: [{ id: "approve" }],
      failures: [{ id: "broken" }],
      results: [
        {
          routineId: "brief",
          routineName: "Routine brief",
          sessionId: "brief-thread",
          summary: "Summary at 2026-11-05T09:30:00.000Z",
        },
      ],
    });
  });
});
