import { describe, expect, it } from "vitest";
import { getAgentInputDelivery } from "./follow-up-behavior-types";

describe("getAgentInputDelivery", () => {
  it("maps running follow-ups without changing idle sends", () => {
    expect(getAgentInputDelivery({ behavior: "queue", isRunning: false })).toBe(
      "start-new-run",
    );
    expect(getAgentInputDelivery({ behavior: "queue", isRunning: true })).toBe(
      "queue-after-run",
    );
    expect(getAgentInputDelivery({ behavior: "steer", isRunning: true })).toBe(
      "steer-active-run",
    );
    expect(
      getAgentInputDelivery({
        behavior: "steer",
        isRunning: true,
        supportsSteering: false,
      }),
    ).toBe("queue-after-run");
    expect(
      getAgentInputDelivery({
        behavior: "queue",
        isRunning: true,
        supportsSteering: true,
        useOppositeBehavior: true,
      }),
    ).toBe("steer-active-run");
  });
});
