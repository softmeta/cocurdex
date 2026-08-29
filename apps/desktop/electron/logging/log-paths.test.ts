import { describe, expect, it } from "vitest";
import {
  buildArchiveLogFileName,
  buildSessionLogFileName,
  isExpired,
  sanitizeSessionId,
} from "./log-paths";

describe("log-paths", () => {
  const date = new Date("2026-06-10T08:09:10.123Z");

  it("builds a timestamped session log file name", () => {
    expect(buildSessionLogFileName("abc-123", date)).toBe(
      "2026-06-10T08-09-10-123Z-abc-123.log",
    );
  });

  it("sanitizes unsafe characters in the session id", () => {
    expect(sanitizeSessionId("../etc/passwd")).toBe("___etc_passwd");
  });

  it("builds a dated archive name from a base log file name", () => {
    expect(buildArchiveLogFileName("main.log", date)).toBe(
      "main-2026-06-10T08-09-10-123Z.log",
    );
  });

  it("treats files older than the retention window as expired", () => {
    const now = date.getTime();
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
    const sixDaysAgo = now - 6 * 24 * 60 * 60 * 1000;

    expect(isExpired(eightDaysAgo, now, 7)).toBe(true);
    expect(isExpired(sixDaysAgo, now, 7)).toBe(false);
  });

  it("never expires when retention is zero or negative", () => {
    expect(isExpired(0, date.getTime(), 0)).toBe(false);
    expect(isExpired(0, date.getTime(), -1)).toBe(false);
  });
});
