import type { AgentEvent, AgentPlanApprovalRecord } from "@cocurdex/shared";
import { atom } from "jotai";

type PlanApprovalsBySession = Record<string, AgentPlanApprovalRecord[]>;

export const planApprovalsBySessionAtom = atom<PlanApprovalsBySession>({});

export const clearPlanApprovalsForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const current = get(planApprovalsBySessionAtom);
    const { [sessionId]: _removed, ...next } = current;

    set(planApprovalsBySessionAtom, next);
  },
);

function upsertPlanApproval(
  approvals: AgentPlanApprovalRecord[],
  nextApproval: AgentPlanApprovalRecord,
) {
  const index = approvals.findIndex(
    (approval) => approval.id === nextApproval.id,
  );

  if (index === -1) {
    return [...approvals, nextApproval];
  }

  return approvals.map((approval, approvalIndex) =>
    approvalIndex === index ? nextApproval : approval,
  );
}

// Same reconciliation as hydratePendingPermissionsAtom: upsert the daemon's
// pending approvals, drop locally-pending entries it no longer holds, and
// preserve resolved/stale records for transcript history.
export const hydratePendingPlanApprovalsAtom = atom(
  null,
  (get, set, pending: AgentPlanApprovalRecord[]) => {
    const pendingIds = new Set(pending.map((record) => record.id));
    const next: PlanApprovalsBySession = {};
    for (const [sessionId, records] of Object.entries(
      get(planApprovalsBySessionAtom),
    )) {
      const kept = records.filter(
        (record) => record.status !== "pending" || pendingIds.has(record.id),
      );
      if (kept.length > 0) {
        next[sessionId] = kept;
      }
    }
    for (const record of pending) {
      next[record.sessionId] = upsertPlanApproval(
        next[record.sessionId] ?? [],
        record,
      );
    }
    set(planApprovalsBySessionAtom, next);
  },
);

export const applyPlanApprovalEventAtom = atom(
  null,
  (get, set, event: AgentEvent) => {
    if (
      event.type !== "plan.approval.requested" &&
      event.type !== "plan.approval.resolved"
    ) {
      return;
    }

    const approvalsBySession = get(planApprovalsBySessionAtom);
    const sessionApprovals = approvalsBySession[event.sessionId] ?? [];

    set(planApprovalsBySessionAtom, {
      ...approvalsBySession,
      [event.sessionId]: upsertPlanApproval(sessionApprovals, event.approval),
    });
  },
);

export function findPendingPlanApproval(
  approvals: AgentPlanApprovalRecord[] | undefined,
) {
  return approvals?.find((approval) => approval.status === "pending") ?? null;
}
