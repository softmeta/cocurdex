import {
  deliversToWatcher,
  MAX_WATCHED_SESSIONS,
  normalizeWatchedSessions,
} from "@cocurdex/daemon/internal/session-event-filter";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const delta = (sessionId: string) =>
  ({
    type: "message.delta",
    sessionId,
    messageId: "m1",
    role: "assistant",
    kind: "response",
    delta: "Hi",
    createdAt: "2026-11-02T00:00:00.000Z",
  }) as CocurdexDaemonEvent;

const completed = (sessionId: string) =>
  ({
    type: "message.completed",
    sessionId,
    message: { id: "m1", sessionId },
  }) as unknown as CocurdexDaemonEvent;

const stateChanged = (sessionId: string) =>
  ({
    type: "state.changed",
    sessionId,
    state: "running",
  }) as unknown as CocurdexDaemonEvent;

describe("deliversToWatcher", () => {
  it("delivers everything to a client that never chose sessions", () => {
    expect(deliversToWatcher(delta("s2"), null)).toBe(true);
  });

  it("delivers streaming progress only for watched sessions", () => {
    const watched = normalizeWatchedSessions(["s1"]);
    expect(deliversToWatcher(delta("s1"), watched)).toBe(true);
    expect(deliversToWatcher(delta("s2"), watched)).toBe(false);
  });

  it("keeps final, list, and attention events flowing for every session", () => {
    const watched = normalizeWatchedSessions([]);
    expect(deliversToWatcher(stateChanged("s2"), watched)).toBe(true);
    expect(deliversToWatcher(completed("s2"), watched)).toBe(true);
    expect(
      deliversToWatcher({ type: "data.changed", areas: ["agent"] }, watched),
    ).toBe(true);
  });
});

describe("normalizeWatchedSessions", () => {
  it("treats a missing list as no filter and caps a long one", () => {
    expect(normalizeWatchedSessions(undefined)).toBeNull();
    const many = Array.from({ length: 100 }, (_, index) => `s${index}`);
    expect(normalizeWatchedSessions([...many, 7, ""])?.size).toBe(
      MAX_WATCHED_SESSIONS,
    );
  });
});
