import {
  decideDelivery,
  decideRunOutcome,
} from "@cocurdex/daemon/internal/session-control/run-decisions";
import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const reply: MessageRecord = {
  id: "reply",
  sessionId: "s1",
  role: "assistant",
  content: "done",
  attachments: [],
  createdAt: "2026-10-11T00:00:00.000Z",
};

describe("decideDelivery", () => {
  it("queues a held message whether or not a run is active", () => {
    expect(
      decideDelivery({
        requested: "queue-after-run",
        hasActiveRun: false,
        hold: true,
      }),
    ).toEqual({ kind: "queue" });
    expect(
      decideDelivery({
        requested: "start-new-run",
        hasActiveRun: true,
        hold: true,
      }),
    ).toEqual({ kind: "queue" });
  });

  it("starts a run when the session is idle", () => {
    expect(
      decideDelivery({ requested: "start-new-run", hasActiveRun: false }),
    ).toEqual({ kind: "start" });
    expect(
      decideDelivery({ requested: undefined, hasActiveRun: false }),
    ).toEqual({ kind: "start" });
  });

  it("starts a queued follow-up immediately when nothing is running", () => {
    expect(
      decideDelivery({ requested: "queue-after-run", hasActiveRun: false }),
    ).toEqual({ kind: "start" });
  });

  it("queues or steers behind an active run", () => {
    expect(
      decideDelivery({ requested: "queue-after-run", hasActiveRun: true }),
    ).toEqual({ kind: "queue" });
    expect(
      decideDelivery({ requested: "steer-active-run", hasActiveRun: true }),
    ).toEqual({ kind: "steer" });
  });

  it("rejects a second run while one is active", () => {
    expect(
      decideDelivery({ requested: "start-new-run", hasActiveRun: true }),
    ).toEqual({ kind: "reject", reason: "active-run" });
  });

  it("rejects a human steer with nothing to steer", () => {
    expect(
      decideDelivery({ requested: "steer-active-run", hasActiveRun: false }),
    ).toEqual({ kind: "reject", reason: "no-active-run" });
  });

  it("starts a run for a peer steer that arrives after the run ended", () => {
    expect(
      decideDelivery({
        requested: "steer-active-run",
        hasActiveRun: false,
        fromPeer: true,
      }),
    ).toEqual({ kind: "start" });
  });
});

describe("decideRunOutcome", () => {
  it("completes when the provider returns a reply", () => {
    expect(
      decideRunOutcome({ settlement: { kind: "resolved", message: reply } }),
    ).toEqual({ status: "completed", message: reply });
  });

  it("fails when the provider rejects", () => {
    expect(
      decideRunOutcome({ settlement: { kind: "rejected", error: "boom" } }),
    ).toEqual({ status: "failed", error: "boom" });
  });

  it("fails when the provider reported an error even if it later returned", () => {
    expect(
      decideRunOutcome({
        settlement: { kind: "resolved", message: reply },
        providerFailure: "rate limited",
      }),
    ).toEqual({ status: "failed", error: "rate limited" });
  });

  it("treats a run abandoned before dispatch as cancelled", () => {
    expect(
      decideRunOutcome({ settlement: { kind: "resolved", message: null } }),
    ).toEqual({ status: "cancelled" });
  });

  it("lets a stop win over any provider result", () => {
    expect(
      decideRunOutcome({
        settlement: { kind: "rejected", error: "aborted" },
        stopped: true,
      }),
    ).toEqual({ status: "cancelled" });
  });
});
