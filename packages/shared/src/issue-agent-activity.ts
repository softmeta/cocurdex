import type { SessionPrimaryState } from "./session-attention";

export const ISSUE_AGENT_ACTIVITIES = ["working", "needsYou"] as const;
export type IssueAgentActivity = (typeof ISSUE_AGENT_ACTIVITIES)[number];

const NEEDS_YOU_STATES: ReadonlySet<SessionPrimaryState> = new Set([
  "pending-approval",
  "awaiting-input",
  "plan-ready",
  "failed",
  "completed-unread",
]);

const WORKING_STATES: ReadonlySet<SessionPrimaryState> = new Set([
  "working",
  "connecting",
  "monitoring",
]);

export function isIssueAgentActivity(
  value: unknown,
): value is IssueAgentActivity {
  return ISSUE_AGENT_ACTIVITIES.some((activity) => activity === value);
}

export function issueAgentActivity(
  sessionIds: readonly string[],
  primaryStateOf: (sessionId: string) => SessionPrimaryState | undefined,
): IssueAgentActivity | null {
  let working = false;
  for (const sessionId of sessionIds) {
    const state = primaryStateOf(sessionId);
    if (!state) continue;
    if (NEEDS_YOU_STATES.has(state)) return "needsYou";
    if (WORKING_STATES.has(state)) working = true;
  }
  return working ? "working" : null;
}
