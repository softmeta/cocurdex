import type { SessionRecord } from "@cocurdex/shared/internal/contracts";
import {
  choosePeerDelivery,
  decideRequesterReport,
  isPeerReachable,
  renderPeerEnvelope,
  stripPeerEnvelope,
} from "@cocurdex/shared/internal/peer-messaging";
import { renderTeammateReport } from "@cocurdex/shared/internal/team";
import { describe, expect, it } from "vitest";

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s-1",
    workspaceId: "w-1",
    title: "One",
    agentType: "codex",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastMessageAt: null,
    ...overrides,
  };
}

describe("choosePeerDelivery", () => {
  it("starts a new run for an idle target", () => {
    expect(
      choosePeerDelivery({ hasActiveTurn: false, supportsSteering: true }),
    ).toBe("start-new-run");
  });

  it("steers an active turn when the target agent supports steering", () => {
    expect(
      choosePeerDelivery({ hasActiveTurn: true, supportsSteering: true }),
    ).toBe("steer-active-run");
  });

  it("queues behind an active turn when steering is unsupported", () => {
    expect(
      choosePeerDelivery({ hasActiveTurn: true, supportsSteering: false }),
    ).toBe("queue-after-run");
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

describe("decideRequesterReport", () => {
  const base = {
    dropped: false,
    requesterArchived: false,
    requesterHasActiveRun: false,
    requesterSupportsSteering: true,
    recovering: false,
  };

  it("starts a new requester run when the requester is idle", () => {
    expect(decideRequesterReport(base)).toEqual({
      kind: "deliver",
      delivery: "start-new-run",
    });
  });

  it("steers a running requester that supports steering and queues otherwise", () => {
    expect(
      decideRequesterReport({ ...base, requesterHasActiveRun: true }),
    ).toEqual({ kind: "deliver", delivery: "steer-active-run" });
    expect(
      decideRequesterReport({
        ...base,
        requesterHasActiveRun: true,
        requesterSupportsSteering: false,
      }),
    ).toEqual({ kind: "deliver", delivery: "queue-after-run" });
  });

  it("holds reports recovered after a restart without waking the requester", () => {
    expect(decideRequesterReport({ ...base, recovering: true })).toEqual({
      kind: "deliver",
      delivery: "hold",
    });
  });

  it("drops reports of stopped work and reports to an archived requester", () => {
    expect(decideRequesterReport({ ...base, dropped: true })).toEqual({
      kind: "skip",
    });
    expect(
      decideRequesterReport({
        ...base,
        requesterArchived: true,
        recovering: true,
      }),
    ).toEqual({ kind: "skip" });
  });
});
