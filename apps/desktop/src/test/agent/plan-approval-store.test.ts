import type { AgentEvent, AgentPlanApprovalRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
// Imported from the source modules rather than the feature barrel: the barrel
// pulls in the app shell, whose module-level preference sync needs a browser.
import {
  applyPlanApprovalEventAtom,
  findPendingPlanApproval,
  planApprovalsBySessionAtom,
} from "@/features/agent/plan/plan-approval-store";
import { getActiveCollaborationMode } from "@/features/agent/runtime/runtime-collaboration-mode";

function makeApproval(
  overrides: Partial<AgentPlanApprovalRecord> = {},
): AgentPlanApprovalRecord {
  return {
    id: "call-1",
    sessionId: "session-1",
    providerId: "grok-build",
    planContent: "# Plan\n\n1. Do the thing",
    source: "file-backed",
    status: "pending",
    outcome: null,
    feedback: null,
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("plan approval store", () => {
  it("upserts a requested approval and finds the parked one", () => {
    const store = createStore();
    const event: AgentEvent = {
      type: "plan.approval.requested",
      sessionId: "session-1",
      approval: makeApproval(),
    };

    store.set(applyPlanApprovalEventAtom, event);

    const approvals = store.get(planApprovalsBySessionAtom)["session-1"];
    expect(approvals).toHaveLength(1);
    expect(findPendingPlanApproval(approvals)?.id).toBe("call-1");
  });

  it("replaces the record in place when it resolves, leaving nothing parked", () => {
    const store = createStore();
    store.set(applyPlanApprovalEventAtom, {
      type: "plan.approval.requested",
      sessionId: "session-1",
      approval: makeApproval(),
    });
    store.set(applyPlanApprovalEventAtom, {
      type: "plan.approval.resolved",
      sessionId: "session-1",
      approval: makeApproval({ status: "resolved", outcome: "approved" }),
    });

    const approvals = store.get(planApprovalsBySessionAtom)["session-1"];
    expect(approvals).toHaveLength(1);
    expect(approvals[0].outcome).toBe("approved");
    expect(findPendingPlanApproval(approvals)).toBeNull();
  });
});

describe("getActiveCollaborationMode", () => {
  const runtime = (currentModeId: string | null) => ({
    capabilities: null,
    commands: null,
    configOptions: [],
    mode: currentModeId ? { availableModes: [], currentModeId } : null,
    runtime: null,
  });

  it("falls back to the stored session mode before the agent reports one", () => {
    expect(
      getActiveCollaborationMode({ collaborationMode: "plan" }, runtime(null)),
    ).toBe("plan");
    expect(getActiveCollaborationMode(null, null)).toBe("default");
  });

  it("follows the agent once it reports a mode", () => {
    expect(
      getActiveCollaborationMode(
        { collaborationMode: "plan" },
        runtime("plan"),
      ),
    ).toBe("plan");
    // Approving or abandoning a plan drops the agent back to default; the
    // composer toggle must not keep claiming plan mode.
    expect(
      getActiveCollaborationMode(
        { collaborationMode: "plan" },
        runtime("default"),
      ),
    ).toBe("default");
    expect(
      getActiveCollaborationMode({ collaborationMode: "plan" }, runtime("ask")),
    ).toBe("default");
  });
});
