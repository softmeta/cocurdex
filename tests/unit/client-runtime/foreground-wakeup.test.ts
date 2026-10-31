import {
  foregroundWakeup,
  SUSPENDED_RECONNECT_AFTER_MS,
} from "@cocurdex/client-runtime";
import { describe, expect, it } from "vitest";

describe("foregroundWakeup", () => {
  it("probes after a short or unknown background stay", () => {
    expect(foregroundWakeup(null, 50_000)).toBe("probe");
    expect(
      foregroundWakeup(1_000, 1_000 + SUSPENDED_RECONNECT_AFTER_MS - 1),
    ).toBe("probe");
  });

  it("reconnects after a long suspension", () => {
    expect(foregroundWakeup(1_000, 1_000 + SUSPENDED_RECONNECT_AFTER_MS)).toBe(
      "reconnect",
    );
  });
});
