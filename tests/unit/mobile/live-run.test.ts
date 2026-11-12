import {
  livePhase,
  withTurnEnds,
} from "@cocurdex/mobile/internal/session-detail/live-run";
import type { CondensedItem } from "@cocurdex/mobile/internal/session-detail/transcript-activity";
import type { AgentTurnCompletedEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

describe("livePhase", () => {
  it("reads a chat or assistant run that has not replied yet as thinking", () => {
    expect(livePhase("chat", "planning")).toBe("thinking");
    expect(livePhase("assistant", "planning")).toBe("thinking");
    expect(livePhase("work", "planning")).toBe("working");
  });

  it("follows reasoning and streaming replies in every mode", () => {
    expect(livePhase("work", "thinking")).toBe("thinking");
    expect(livePhase("work", "responding")).toBe("responding");
    expect(livePhase("work", "usingTools")).toBe("working");
  });
});

describe("withTurnEnds", () => {
  const answer: CondensedItem = {
    kind: "assistant",
    id: "a1",
    text: "done",
    streaming: false,
    source: null,
    turnEnd: true,
  };
  const stats: Record<string, AgentTurnCompletedEvent> = {
    a1: {
      type: "turn.completed",
      sessionId: "s1",
      messageId: "a1",
      durationMs: 12_000,
      stopReason: "cancelled",
      completedAt: "2026-01-01T00:00:12.000Z",
    },
  };

  it("attaches the duration and stop of the turn its answer ended", () => {
    expect(withTurnEnds([answer], stats, true)).toMatchObject([
      { id: "a1", turn: { durationMs: 12_000, stopped: true } },
    ]);
  });

  it("keeps the stop but hides the duration where durations are hidden", () => {
    expect(withTurnEnds([answer], stats, false)).toMatchObject([
      { id: "a1", turn: { durationMs: null, stopped: true } },
    ]);
  });
});
