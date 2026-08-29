import { describe, expect, it } from "vitest";
import {
  deriveSessionAttention,
  rollupSessionAttention,
  SESSION_PRIMARY_STATE_PRIORITY,
} from "./session-attention";

describe("deriveSessionAttention", () => {
  it("prioritizes a pending permission over concurrent runtime activity", () => {
    expect(
      deriveSessionAttention({
        sessionStatus: "running",
        activityKind: "foreground",
        hasPendingPermission: true,
        hasPendingQuestion: false,
        hasPendingPlanApproval: false,
        latestResultAt: null,
        lastVisitedAt: null,
        resultDisposition: "automatic",
      }),
    ).toEqual({
      runtimeState: "working",
      attentionState: "pending-approval",
      primaryState: "pending-approval",
    });
  });

  it("prioritizes a pending question over a ready plan", () => {
    expect(
      deriveSessionAttention({
        sessionStatus: "idle",
        activityKind: null,
        hasPendingPermission: false,
        hasPendingQuestion: true,
        hasPendingPlanApproval: true,
        latestResultAt: null,
        lastVisitedAt: null,
        resultDisposition: "automatic",
      }).primaryState,
    ).toBe("awaiting-input");
  });

  it("surfaces a pending plan as ready for review", () => {
    expect(
      deriveSessionAttention({
        sessionStatus: "idle",
        activityKind: null,
        hasPendingPermission: false,
        hasPendingQuestion: false,
        hasPendingPlanApproval: true,
        latestResultAt: null,
        lastVisitedAt: null,
        resultDisposition: "automatic",
      }).attentionState,
    ).toBe("plan-ready");
  });

  it("surfaces failure ahead of background activity", () => {
    expect(
      deriveSessionAttention({
        sessionStatus: "error",
        activityKind: "background",
        hasPendingPermission: false,
        hasPendingQuestion: false,
        hasPendingPlanApproval: false,
        latestResultAt: null,
        lastVisitedAt: null,
        resultDisposition: "automatic",
      }),
    ).toEqual({
      runtimeState: "failed",
      attentionState: "none",
      primaryState: "failed",
    });
  });

  it("marks a completed result unread when it is newer than the last visit", () => {
    expect(
      deriveSessionAttention({
        sessionStatus: "idle",
        activityKind: null,
        hasPendingPermission: false,
        hasPendingQuestion: false,
        hasPendingPlanApproval: false,
        latestResultAt: "2026-08-09T10:05:00.000Z",
        lastVisitedAt: "2026-08-09T10:00:00.000Z",
        resultDisposition: "automatic",
      }),
    ).toEqual({
      runtimeState: "ready",
      attentionState: "completed-unread",
      primaryState: "completed-unread",
    });
  });

  it("keeps active foreground work ahead of an older unread result", () => {
    expect(
      deriveSessionAttention({
        sessionStatus: "running",
        activityKind: "foreground",
        hasPendingPermission: false,
        hasPendingQuestion: false,
        hasPendingPlanApproval: false,
        latestResultAt: "2026-08-09T10:05:00.000Z",
        lastVisitedAt: null,
        resultDisposition: "automatic",
      }).primaryState,
    ).toBe("working");
  });

  it("honors a manual unread mark after a later visit", () => {
    expect(
      deriveSessionAttention({
        sessionStatus: "idle",
        activityKind: null,
        hasPendingPermission: false,
        hasPendingQuestion: false,
        hasPendingPlanApproval: false,
        latestResultAt: "2026-08-09T10:00:00.000Z",
        lastVisitedAt: "2026-08-09T10:05:00.000Z",
        resultDisposition: "unread",
      }).attentionState,
    ).toBe("completed-unread");
  });
});

describe("rollupSessionAttention", () => {
  it("counts each session by its highest-priority state", () => {
    expect(
      rollupSessionAttention([
        "pending-approval",
        "working",
        "working",
        "failed",
      ]),
    ).toEqual({
      "pending-approval": 1,
      "awaiting-input": 0,
      "plan-ready": 0,
      failed: 1,
      working: 2,
      connecting: 0,
      "completed-unread": 0,
      monitoring: 0,
      ready: 0,
    });
  });
});

describe("session attention priority", () => {
  it("keeps user action and failures ahead of passive runtime states", () => {
    expect(SESSION_PRIMARY_STATE_PRIORITY).toEqual([
      "pending-approval",
      "awaiting-input",
      "plan-ready",
      "failed",
      "working",
      "connecting",
      "completed-unread",
      "monitoring",
      "ready",
    ]);
  });
});
