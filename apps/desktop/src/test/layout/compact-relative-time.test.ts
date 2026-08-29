import { describe, expect, it } from "vitest";
import { getCompactRelativeTime } from "@/app/layout/sidebar/compact-relative-time";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");

function isoMinutesAgo(minutes: number) {
  return new Date(NOW - minutes * 60_000).toISOString();
}

describe("getCompactRelativeTime", () => {
  it("returns now for timestamps under a minute old", () => {
    expect(getCompactRelativeTime(isoMinutesAgo(0.5), NOW)).toEqual({
      count: 0,
      unit: "now",
    });
  });

  it("returns minutes, hours, and days", () => {
    expect(getCompactRelativeTime(isoMinutesAgo(12), NOW)).toEqual({
      count: 12,
      unit: "m",
    });
    expect(getCompactRelativeTime(isoMinutesAgo(5 * 60), NOW)).toEqual({
      count: 5,
      unit: "h",
    });
    expect(getCompactRelativeTime(isoMinutesAgo(3 * 24 * 60), NOW)).toEqual({
      count: 3,
      unit: "d",
    });
  });

  it("returns months and years using 30-day months", () => {
    expect(
      getCompactRelativeTime(isoMinutesAgo(60 * 24 * 30 * 2), NOW),
    ).toEqual({
      count: 2,
      unit: "mo",
    });
    expect(
      getCompactRelativeTime(isoMinutesAgo(60 * 24 * 365 * 3), NOW),
    ).toEqual({
      count: 3,
      unit: "y",
    });
  });

  it("treats invalid and future timestamps as now", () => {
    expect(getCompactRelativeTime("not-a-date", NOW)).toEqual({
      count: 0,
      unit: "now",
    });
    expect(getCompactRelativeTime("2026-08-19T13:00:00.000Z", NOW)).toEqual({
      count: 0,
      unit: "now",
    });
  });
});
