import { formatListTime } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const local = (...parts: [number, number, number, number?, number?]) => {
  const [year, month, day, hour = 0, minute = 0] = parts;
  return new Date(year, month - 1, day, hour, minute).getTime();
};
const iso = (ms: number) => new Date(ms).toISOString();
const now = local(2026, 11, 7, 9, 30);

describe("formatListTime", () => {
  it("shows a 24-hour clock for anything since local midnight", () => {
    expect(
      formatListTime(iso(local(2026, 11, 7, 0, 0)), now, "en-US", "Y"),
    ).toBe("00:00");
    expect(
      formatListTime(iso(local(2026, 11, 7, 9, 5)), now, "zh-CN", "Y"),
    ).toBe("09:05");
  });

  it("names the previous calendar day, even minutes before midnight", () => {
    expect(
      formatListTime(
        iso(local(2026, 11, 6, 23, 59)),
        now,
        "en-US",
        "Yesterday",
      ),
    ).toBe("Yesterday");
    expect(
      formatListTime(iso(local(2026, 11, 6, 0, 0)), now, "en-US", "Yesterday"),
    ).toBe("Yesterday");
  });

  it("falls back to month and day this year, and a full date before", () => {
    const earlier = iso(local(2026, 10, 30, 12));
    expect(formatListTime(earlier, now, "zh-CN", "昨天")).toBe("10月30日");
    expect(formatListTime(earlier, now, "en-US", "Yesterday")).toBe("Oct 30");
    expect(
      formatListTime(iso(local(2025, 12, 31, 12)), now, "zh-CN", "昨天"),
    ).toBe("2025/12/31");
  });

  it("treats the day before yesterday across a month boundary as a date", () => {
    const firstOfMonth = local(2026, 11, 1, 8);
    expect(
      formatListTime(iso(local(2026, 10, 31, 22)), firstOfMonth, "en-US", "Y"),
    ).toBe("Y");
    expect(
      formatListTime(iso(local(2026, 10, 30, 22)), firstOfMonth, "en-US", "Y"),
    ).toBe("Oct 30");
  });

  it("returns null for an unparseable timestamp", () => {
    expect(formatListTime("not a date", now, "en-US", "Y")).toBeNull();
  });
});
