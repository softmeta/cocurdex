import {
  deriveSessionAttention,
  type IssueAgentActivity,
  issueAgentActivity,
  type SessionPrimaryState,
} from "@cocurdex/shared";
import { atom, useAtomValue } from "jotai";
import {
  permissionsBySessionAtom,
  planApprovalsBySessionAtom,
  questionsBySessionAtom,
} from "@/features/agent";
import { sessionResultAttentionAtom, sessionsAtom } from "@/features/sessions";
import type { IssueActivityLookup } from "./issue-nav";

function hasPending(requests: readonly { status: string }[] | undefined) {
  return requests?.some((request) => request.status === "pending") ?? false;
}

const sessionPrimaryStatesAtom = atom((get) => {
  const permissions = get(permissionsBySessionAtom);
  const questions = get(questionsBySessionAtom);
  const planApprovals = get(planApprovalsBySessionAtom);
  const results = get(sessionResultAttentionAtom);
  const states = new Map<string, SessionPrimaryState>();
  for (const session of get(sessionsAtom)) {
    const result = results[session.id];
    const { primaryState } = deriveSessionAttention({
      sessionStatus: session.status,
      activityKind: session.status === "running" ? "foreground" : null,
      hasPendingPermission: hasPending(permissions[session.id]),
      hasPendingQuestion: hasPending(questions[session.id]),
      hasPendingPlanApproval: hasPending(planApprovals[session.id]),
      latestResultAt: result?.latestResultAt ?? null,
      lastVisitedAt: result?.lastVisitedAt ?? null,
      resultDisposition: result?.resultDisposition ?? "automatic",
    });
    states.set(session.id, primaryState);
  }
  return states;
});

const issueActivityLookupAtom = atom<IssueActivityLookup>((get) => {
  const states = get(sessionPrimaryStatesAtom);
  return (sessionIds): IssueAgentActivity | null =>
    issueAgentActivity(sessionIds, (id) => states.get(id));
});

export function useIssueActivityLookup(): IssueActivityLookup {
  return useAtomValue(issueActivityLookupAtom);
}
