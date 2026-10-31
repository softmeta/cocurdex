import { createFixedWindowRateLimiter } from "@cocurdex/daemon/internal/host-access/rate-limiter";
import { describe, expect, it } from "vitest";

describe("createFixedWindowRateLimiter", () => {
  it("allows up to the limit per key within a window and resets afterwards", () => {
    const limiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });

    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("a", 10)).toBe(true);
    expect(limiter.take("a", 20)).toBe(false);
    expect(limiter.take("b", 20)).toBe(true);
    expect(limiter.take("a", 1_000)).toBe(true);
  });
});
