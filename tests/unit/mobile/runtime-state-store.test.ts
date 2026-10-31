import { createRuntimeStateStore } from "@cocurdex/mobile/internal/session-config/runtime-state-store";
import {
  type AgentSessionRuntimeState,
  EMPTY_AGENT_SESSION_RUNTIME_STATE,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { calls, fakeConnection } from "./fake-connection";

const LOADED: AgentSessionRuntimeState = {
  ...EMPTY_AGENT_SESSION_RUNTIME_STATE,
  configOptions: [
    { id: "plan", name: "Plan", type: "boolean", currentValue: false },
  ],
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createRuntimeStateStore", () => {
  it("loads the daemon's cached state, then follows live updates", async () => {
    const fake = fakeConnection({ "session.runtimeState": [LOADED] });
    const store = createRuntimeStateStore(fake.connection, "s1");
    const stop = store.subscribe(() => {});
    await flush();

    expect(store.getSnapshot().configOptions[0]?.currentValue).toBe(false);

    fake.emit({
      type: "session.config.updated",
      sessionId: "s1",
      configOptions: [
        { id: "plan", name: "Plan", type: "boolean", currentValue: true },
      ],
    });
    fake.emit({
      type: "session.config.updated",
      sessionId: "other",
      configOptions: [],
    });

    expect(store.getSnapshot().configOptions[0]?.currentValue).toBe(true);
    stop();
    expect(fake.listenerCount()).toBe(0);
  });

  it("reloads after the connection comes back", async () => {
    const fake = fakeConnection({ "session.runtimeState": [LOADED] });
    const store = createRuntimeStateStore(fake.connection, "s1");
    const stop = store.subscribe(() => {});
    fake.setStatus("live");
    fake.setStatus("retrying");
    fake.setStatus("live");
    await flush();

    expect(calls(fake.request, "session.runtimeState")).toBe(3);
    stop();
  });
});
