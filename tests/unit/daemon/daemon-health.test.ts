import {
  eventLoopDelayMs,
  isEventLoopDelayed,
} from "@cocurdex/daemon/internal/daemon-health";
import { describe, expect, it } from "vitest";

const calm = {
  windowSeconds: 60,
  utilization: 0.1,
  delayP50Ms: 10,
  delayP99Ms: 30,
  delayMaxMs: 80,
};

describe("isEventLoopDelayed", () => {
  it("flags a window whose tail latency or single worst stall is too long", () => {
    expect(isEventLoopDelayed(calm)).toBe(false);
    expect(isEventLoopDelayed({ ...calm, delayP99Ms: 250 })).toBe(true);
    expect(isEventLoopDelayed({ ...calm, delayMaxMs: 1_000 })).toBe(true);
  });
});

describe("eventLoopDelayMs", () => {
  it("reports only the lag beyond the sampling interval", () => {
    expect(eventLoopDelayMs(21_000_000, 20)).toBe(1);
    expect(eventLoopDelayMs(270_450_000, 20)).toBe(250.5);
    expect(eventLoopDelayMs(19_000_000, 20)).toBe(0);
  });
});
