import { describe, expect, it } from "vitest";
import type { SessionRecord } from "./contracts";
import {
  choosePeerDelivery,
  isPeerReachable,
  renderPeerEnvelope,
  stripPeerEnvelope,
} from "./peer-messaging";
import { renderTeammateReport } from "./team";

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s-1",
    workspaceId: "w-1",
    title: "One",
    agentType: "codex",
    status: "idle",
    writeMode: "read-only",
    collaborationMode: "default",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastMessageAt: null,
    ...overrides,
  };
}

describe("choosePeerDelivery", () => {
  it("starts a new run for an idle target", () => {
    expect(choosePeerDelivery({ hasActiveTurn: false })).toBe("start-new-run");
  });

  it("queues behind an active turn", () => {
    expect(choosePeerDelivery({ hasActiveTurn: true })).toBe("queue-after-run");
  });
});

describe("renderPeerEnvelope", () => {
  it("prefixes the content with the sender identity", () => {
    expect(
      renderPeerEnvelope(
        { kind: "peer", sessionId: "s-2", sessionTitle: "Reviewer" },
        "Build is green.",
      ),
    ).toBe('[Message from session "Reviewer" (s-2)]\nBuild is green.');
  });
});

describe("isPeerReachable", () => {
  it("excludes the sender itself", () => {
    expect(isPeerReachable(session(), "s-1")).toBe(false);
  });

  it("excludes archived sessions", () => {
    expect(
      isPeerReachable(session({ archivedAt: "2026-01-02T00:00:00Z" }), "x"),
    ).toBe(false);
  });

  it("excludes provider subagent projections", () => {
    expect(isPeerReachable(session({ sessionKind: "subagent" }), "x")).toBe(
      false,
    );
  });

  it("includes main sessions", () => {
    expect(isPeerReachable(session(), "x")).toBe(true);
  });
});

describe("stripPeerEnvelope", () => {
  const origin = {
    kind: "peer" as const,
    sessionId: "s-2",
    sessionTitle: "Two",
  };

  it("recovers the body of peer envelopes and teammate reports", () => {
    expect(stripPeerEnvelope(renderPeerEnvelope(origin, "hi\nthere"))).toBe(
      "hi\nthere",
    );
    expect(
      stripPeerEnvelope(
        renderTeammateReport({ name: "probe", outcome: "finished" }, "ok"),
      ),
    ).toBe("ok");
  });

  it("keeps content without an envelope", () => {
    expect(stripPeerEnvelope("[x] done\nnext")).toBe("[x] done\nnext");
  });
});
