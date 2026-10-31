import { describe, expect, it } from "vitest";
import { formatActivityTime } from "@/lib/relative-time";

const NOW = new Date(2026, 9, 14, 17, 30).getTime();

describe("formatActivityTime", () => {
  it("pairs a relative age with the exact time in the same year", () => {
    const iso = new Date(2026, 9, 14, 14, 5, 9).toISOString();
    expect(formatActivityTime(iso, NOW, "en-US", "just now")).toEqual({
      relative: "3 hours ago",
      absolute: "Oct 14, 14:05:09",
    });
    expect(formatActivityTime(iso, NOW, "zh-CN", "刚刚")).toEqual({
      relative: "3小时前",
      absolute: "10月14日 14:05:09",
    });
  });

  it("includes the year for activity from an earlier year", () => {
    const iso = new Date(2025, 11, 31, 9, 0).toISOString();
    expect(formatActivityTime(iso, NOW, "en-US", "just now")?.absolute).toBe(
      "Dec 31, 2025, 09:00:00",
    );
  });

  it("uses the provided label for activity within the last minute", () => {
    const iso = new Date(NOW - 10_000).toISOString();
    expect(formatActivityTime(iso, NOW, "en-US", "just now")?.relative).toBe(
      "just now",
    );
  });

  it("returns null for an unparseable timestamp", () => {
    expect(
      formatActivityTime("not a date", NOW, "en-US", "just now"),
    ).toBeNull();
  });
});
