import {
  alertAllowed,
  routineRunAlert,
} from "@cocurdex/daemon/internal/outbox/alert-policy";
import type { RoutineRunRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const plain = {
  sessionKind: "main",
  personaMuted: false,
  routineDeliver: null,
} as const;

describe("alertAllowed", () => {
  it("alerts every kind for a plain session and nothing for a muted persona", () => {
    expect(alertAllowed(plain, "turnCompleted", "turn")).toBe(true);
    expect(
      alertAllowed({ ...plain, personaMuted: true }, "question", "turn"),
    ).toBe(false);
    expect(
      alertAllowed({ ...plain, sessionKind: "subagent" }, "approval", "turn"),
    ).toBe(false);
  });

  it("leaves routine results to the run and filters them by delivery", () => {
    const routine = { ...plain, routineDeliver: "silent" as const };
    expect(alertAllowed(routine, "turnCompleted", "turn")).toBe(false);
    expect(alertAllowed(routine, "approval", "turn")).toBe(true);
    expect(alertAllowed(routine, "turnCompleted", "routine")).toBe(false);
    expect(alertAllowed(routine, "question", "routine")).toBe(true);
    expect(
      alertAllowed(
        { ...plain, routineDeliver: "push" },
        "turnCompleted",
        "routine",
      ),
    ).toBe(true);
  });
});

describe("routineRunAlert", () => {
  const run = {
    status: "succeeded",
    outcome: "ready",
    summary: "Three meetings",
    question: null,
  } as RoutineRunRecord;

  it("maps each run outcome to the alert the user should get", () => {
    expect(routineRunAlert(run)).toEqual({
      kind: "turnCompleted",
      detail: "Three meetings",
    });
    expect(
      routineRunAlert({ ...run, outcome: "needs_you", question: "Book it?" }),
    ).toEqual({ kind: "question", detail: "Book it?" });
    expect(routineRunAlert({ ...run, outcome: "dropped" })).toBeNull();
    expect(
      routineRunAlert({ ...run, status: "failed", outcome: "failed" })?.kind,
    ).toBe("turnFailed");
  });
});
