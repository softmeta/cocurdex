import {
  keepOlderPages,
  mergeOlderBoundary,
  prependTranscriptPage,
} from "@cocurdex/client-runtime";
import type {
  MessageRecord,
  SessionObservationSnapshot,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function message(id: string, seq: number): MessageRecord {
  return {
    id,
    sessionId: "session",
    role: "assistant",
    content: id,
    attachments: [],
    createdAt: "2026-11-11T00:00:00.000Z",
    seq,
  };
}

function observation(
  messages: MessageRecord[],
  olderBeforeSeq: number | null,
): SessionObservationSnapshot {
  return {
    session: {
      id: "session",
      workspaceId: "workspace",
      title: "Session",
      agentType: "pi",
      status: "idle",
      writeMode: "read-only",
      sessionModeId: null,
      createdAt: "2026-11-11T00:00:00.000Z",
      updatedAt: "2026-11-11T00:00:00.000Z",
      lastMessageAt: null,
    },
    messages,
    activeMessages: [],
    toolCalls: [],
    queuedAgentInputs: [],
    activeRun: null,
    usage: null,
    turnChangeSets: {},
    interactions: { permissions: [], questions: [], planApprovals: [] },
    plan: null,
    olderBeforeSeq,
  };
}

const ids = (snapshot: SessionObservationSnapshot) =>
  snapshot.messages.map((entry) => entry.id);

describe("mergeOlderBoundary", () => {
  it("takes the first boundary, moves back with older pages, and stops at the start", () => {
    expect(mergeOlderBoundary(undefined, 40)).toBe(40);
    expect(mergeOlderBoundary(40, 12)).toBe(12);
    expect(mergeOlderBoundary(12, 40)).toBe(12);
    expect(mergeOlderBoundary(null, 40)).toBeNull();
    expect(mergeOlderBoundary(12, null)).toBeNull();
  });
});

describe("transcript pages", () => {
  it("keeps loaded older pages when the latest window is fetched again", () => {
    const latest = observation([message("c", 30), message("d", 40)], 30);
    const paged = prependTranscriptPage(latest, {
      messages: [message("a", 10), message("b", 20)],
      toolCalls: [],
      turnStats: {},
      turnChangeSets: {},
      olderBeforeSeq: null,
    });
    expect(ids(paged)).toEqual(["a", "b", "c", "d"]);
    expect(paged.olderBeforeSeq).toBeNull();

    const refreshed = keepOlderPages(
      paged,
      observation([message("d", 40), message("e", 50)], 40),
    );
    expect(ids(refreshed)).toEqual(["a", "b", "c", "d", "e"]);
    expect(refreshed.olderBeforeSeq).toBeNull();
  });

  it("replaces the window when nothing older was loaded", () => {
    const refreshed = keepOlderPages(
      observation([message("c", 30)], 30),
      observation([message("c", 30), message("d", 40)], 30),
    );
    expect(ids(refreshed)).toEqual(["c", "d"]);
    expect(refreshed.olderBeforeSeq).toBe(30);
  });
});
