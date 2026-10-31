import { SessionRuntimeStates } from "@cocurdex/daemon/internal/session-control/runtime-states";
import { describe, expect, it } from "vitest";

const configUpdate = {
  type: "session.config.updated",
  sessionId: "s1",
  configOptions: [
    { id: "plan", name: "Plan", type: "boolean", currentValue: true },
  ],
} as const;

describe("SessionRuntimeStates", () => {
  it("serves the latest live state to a client that connects later", () => {
    const states = new SessionRuntimeStates();
    states.apply({
      ...configUpdate,
      configOptions: [...configUpdate.configOptions],
    });

    expect(states.get("s1").configOptions.map((option) => option.id)).toEqual([
      "plan",
    ]);
    expect(states.get("s2").configOptions).toEqual([]);
  });

  it("drops a deleted session's state", () => {
    const states = new SessionRuntimeStates();
    states.apply({
      ...configUpdate,
      configOptions: [...configUpdate.configOptions],
    });
    states.forget("s1");

    expect(states.get("s1").configOptions).toEqual([]);
  });
});
