import {
  ROUTINE_DAILY_RUN_LIMIT,
  routineBackoffMs,
  routineDecision,
  routineNextRunAt,
} from "@cocurdex/daemon/internal/routines/routine-schedule";
import { describe, expect, it } from "vitest";

const MINUTE = 60_000;

describe("routineNextRunAt", () => {
  it("adds the interval to the reference time", () => {
    expect(
      routineNextRunAt(
        { kind: "interval", minutes: 30 },
        "UTC",
        new Date("2026-11-05T10:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-05T10:30:00.000Z");
  });

  it("picks today's time in the routine's time zone when it is still ahead", () => {
    expect(
      routineNextRunAt(
        { kind: "daily", time: "08:00", weekdays: null },
        "Asia/Shanghai",
        new Date("2026-11-04T23:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-05T00:00:00.000Z");
  });

  it("moves to tomorrow once today's time has passed", () => {
    expect(
      routineNextRunAt(
        { kind: "daily", time: "08:00", weekdays: null },
        "Asia/Shanghai",
        new Date("2026-11-05T00:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-06T00:00:00.000Z");
  });

  it("skips weekdays the routine does not run on", () => {
    expect(
      routineNextRunAt(
        { kind: "daily", time: "09:00", weekdays: [1] },
        "UTC",
        new Date("2026-11-05T12:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-09T09:00:00.000Z");
  });

  it("keeps the wall-clock time across a daylight saving change", () => {
    expect(
      routineNextRunAt(
        { kind: "daily", time: "08:00", weekdays: null },
        "America/New_York",
        new Date("2026-10-31T13:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-01T13:00:00.000Z");
  });
});

describe("routineBackoffMs", () => {
  it("doubles from 15 minutes and caps at 4 hours", () => {
    expect([1, 2, 3, 4, 5, 9].map(routineBackoffMs)).toEqual([
      15 * MINUTE,
      30 * MINUTE,
      60 * MINUTE,
      120 * MINUTE,
      240 * MINUTE,
      240 * MINUTE,
    ]);
  });
});

describe("routineDecision", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const base = { paused: false, running: false, recentRuns: 0 };

  it("waits until the next run is due", () => {
    expect(
      routineDecision({ ...base, nextRunAt: "2026-11-05T10:00:01Z" }, now),
    ).toEqual({ kind: "wait" });
  });

  it("runs on time, and as one catch-up run after a long gap", () => {
    expect(
      routineDecision({ ...base, nextRunAt: "2026-11-05T10:00:00Z" }, now),
    ).toEqual({ kind: "run", trigger: "schedule" });
    expect(
      routineDecision({ ...base, nextRunAt: "2026-11-04T08:00:00Z" }, now),
    ).toEqual({ kind: "run", trigger: "catch-up" });
  });

  it("never starts a second run or a paused routine", () => {
    const due = { ...base, nextRunAt: "2026-11-05T09:00:00Z" };
    expect(routineDecision({ ...due, running: true }, now)).toEqual({
      kind: "wait",
    });
    expect(routineDecision({ ...due, paused: true }, now)).toEqual({
      kind: "wait",
    });
  });

  it("skips a due run once the daily AI run limit is used up", () => {
    expect(
      routineDecision(
        {
          ...base,
          nextRunAt: "2026-11-05T09:59:00Z",
          recentRuns: ROUTINE_DAILY_RUN_LIMIT,
        },
        now,
      ),
    ).toEqual({ kind: "skip", reason: "limit" });
  });
});
