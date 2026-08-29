import type { AgentEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createNativeSessionTitleTracker } from "./native-session-title";

describe("createNativeSessionTitleTracker", () => {
  it("chains expected titles so manual renames remain protected by CAS", () => {
    const events: AgentEvent[] = [];
    const updateTitle = createNativeSessionTitleTracker({
      initialTitle: "Local fallback",
      now: () => "2026-08-15T00:00:00.000Z",
      onEvent: (event) => events.push(event),
      sessionId: "session-1",
    });

    expect(updateTitle(" Native title ")).toBe(true);
    expect(updateTitle("Updated native title")).toBe(true);

    expect(events).toEqual([
      {
        type: "session.title.updated",
        sessionId: "session-1",
        title: "Native title",
        expectedTitle: "Local fallback",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
      {
        type: "session.title.updated",
        sessionId: "session-1",
        title: "Updated native title",
        expectedTitle: "Native title",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
    ]);
  });

  it("ignores provider titles for resumed sessions", () => {
    const events: AgentEvent[] = [];
    const updateTitle = createNativeSessionTitleTracker({
      initialTitle: null,
      onEvent: (event) => events.push(event),
      sessionId: "session-1",
    });

    expect(updateTitle("Provider title")).toBe(false);
    expect(events).toEqual([]);
  });
});
