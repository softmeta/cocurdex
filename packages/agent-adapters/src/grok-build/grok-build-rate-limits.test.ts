import { describe, expect, it } from "vitest";
import { parseGrokBuildRateLimits } from "./grok-build-rate-limits";

describe("parseGrokBuildRateLimits", () => {
  it("maps the current weekly Grok credit period", () => {
    expect(
      parseGrokBuildRateLimits({
        result: {
          config: {
            creditUsagePercent: 63.5,
            currentPeriod: {
              type: "USAGE_PERIOD_TYPE_WEEKLY",
              end: "2026-08-10T00:00:00Z",
            },
          },
        },
      })?.windows,
    ).toEqual([
      {
        kind: "weekly",
        resetsAt: "2026-08-10T00:00:00.000Z",
        usedPercent: 63.5,
      },
    ]);
  });

  it("returns no snapshot when billing usage is unavailable", () => {
    expect(parseGrokBuildRateLimits({ config: null })).toBeNull();
  });
});
