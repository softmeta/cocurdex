import { routinePushAllowed } from "@cocurdex/daemon/internal/routines/routine-policy";
import { describe, expect, it } from "vitest";

describe("routinePushAllowed", () => {
  it("always pushes what needs an answer and filters results by delivery", () => {
    for (const deliver of ["inbox", "push", "silent"] as const) {
      expect(routinePushAllowed(deliver, "approval")).toBe(true);
    }
    expect(routinePushAllowed("push", "turnCompleted")).toBe(true);
    expect(routinePushAllowed("inbox", "turnCompleted")).toBe(false);
    expect(routinePushAllowed("inbox", "turnFailed")).toBe(true);
    expect(routinePushAllowed("silent", "turnFailed")).toBe(false);
  });
});
