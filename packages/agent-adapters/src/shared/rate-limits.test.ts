import { describe, expect, it } from "vitest";
import {
  createRateLimitsRecord,
  createRateLimitWindow,
  inferRateLimitWindowKind,
} from "./rate-limits";

describe("rate limit normalization", () => {
  it("maps native window durations to user-facing quota kinds", () => {
    expect(inferRateLimitWindowKind("primary", 300)).toBe("five-hour");
    expect(inferRateLimitWindowKind("secondary", 10_080)).toBe("weekly");
    expect(inferRateLimitWindowKind("primary", 15)).toBe("primary");
  });

  it("clamps percentages and converts epoch resets to ISO timestamps", () => {
    expect(
      createRateLimitWindow({
        kind: "five-hour",
        resetsAt: 1_738_425_600,
        usedPercent: 123.5,
        windowDurationMinutes: 300,
      }),
    ).toEqual({
      kind: "five-hour",
      resetsAt: "2025-02-01T16:00:00.000Z",
      usedPercent: 100,
      windowDurationMinutes: 300,
    });
  });

  it("omits an unavailable quota snapshot", () => {
    expect(createRateLimitsRecord([null])).toBeNull();
  });
});
