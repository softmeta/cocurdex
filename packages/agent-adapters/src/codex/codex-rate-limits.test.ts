import { describe, expect, it } from "vitest";
import { parseCodexRateLimits } from "./codex-rate-limits";

describe("parseCodexRateLimits", () => {
  it("maps Codex primary and secondary windows", () => {
    const result = parseCodexRateLimits({
      rateLimits: {
        primary: {
          usedPercent: 25,
          windowDurationMins: 300,
          resetsAt: 1_738_425_600,
        },
        secondary: {
          usedPercent: 40,
          windowDurationMins: 10_080,
          resetsAt: 1_738_857_600,
        },
      },
    });

    expect(result?.windows).toEqual([
      expect.objectContaining({ kind: "five-hour", usedPercent: 25 }),
      expect.objectContaining({ kind: "weekly", usedPercent: 40 }),
    ]);
  });

  it("accepts sparse update parameters", () => {
    expect(
      parseCodexRateLimits({
        rateLimits: {
          primary: { usedPercent: 50, windowDurationMins: 15 },
        },
      })?.windows,
    ).toEqual([expect.objectContaining({ kind: "primary", usedPercent: 50 })]);
  });
});
