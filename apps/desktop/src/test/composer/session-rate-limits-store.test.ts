import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  applyRateLimitsEventAtom,
  sessionRateLimitsAtom,
} from "@/features/composer/session-rate-limits-store";

describe("session rate limits store", () => {
  it("merges sparse provider updates by quota window", () => {
    const store = createStore();
    store.set(applyRateLimitsEventAtom, {
      type: "rate_limits.updated",
      sessionId: "session-1",
      rateLimits: {
        windows: [
          { kind: "five-hour", usedPercent: 20 },
          { kind: "weekly", usedPercent: 40 },
        ],
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
    });
    store.set(applyRateLimitsEventAtom, {
      type: "rate_limits.updated",
      sessionId: "session-1",
      rateLimits: {
        windows: [{ kind: "five-hour", usedPercent: 25 }],
        updatedAt: "2026-08-03T00:01:00.000Z",
      },
    });

    expect(store.get(sessionRateLimitsAtom)["session-1"]).toEqual({
      windows: [
        { kind: "five-hour", usedPercent: 25 },
        { kind: "weekly", usedPercent: 40 },
      ],
      updatedAt: "2026-08-03T00:01:00.000Z",
    });
  });
});
