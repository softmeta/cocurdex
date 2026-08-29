import type { SessionStatus } from "./contracts";

export type SessionActivityKind = "foreground" | "background" | null;
export type SessionResultDisposition = "automatic" | "unread" | "settled";

export type SessionRuntimeState =
  | "connecting"
  | "working"
  | "monitoring"
  | "ready"
  | "failed";

export type SessionAttentionState =
  | "pending-approval"
  | "awaiting-input"
  | "plan-ready"
  | "completed-unread"
  | "none";

export type SessionPrimaryState =
  | Exclude<SessionAttentionState, "none">
  | SessionRuntimeState;

export const SESSION_PRIMARY_STATE_PRIORITY = [
  "pending-approval",
  "awaiting-input",
  "plan-ready",
  "failed",
  "working",
  "connecting",
  "completed-unread",
  "monitoring",
  "ready",
] as const satisfies readonly SessionPrimaryState[];

export interface SessionAttentionInput {
  sessionStatus: SessionStatus;
  connectionPending?: boolean;
  activityKind: SessionActivityKind;
  hasPendingPermission: boolean;
  hasPendingQuestion: boolean;
  hasPendingPlanApproval: boolean;
  latestResultAt: string | null;
  lastVisitedAt: string | null;
  resultDisposition: SessionResultDisposition;
}

export interface SessionAttentionSummary {
  runtimeState: SessionRuntimeState;
  attentionState: SessionAttentionState;
  primaryState: SessionPrimaryState;
}

export type SessionAttentionAction =
  | "visited"
  | "mark-unread"
  | "settle"
  | "unsettle";

export interface UpdateSessionAttentionPayload {
  sessionId: string;
  action: SessionAttentionAction;
  at: string;
}

export interface SessionAttentionSnapshot extends SessionAttentionSummary {
  sessionId: string;
  activityKind: SessionActivityKind;
  connectionPending: boolean;
  latestResultAt: string | null;
  lastVisitedAt: string | null;
  resultDisposition: SessionResultDisposition;
  updatedAt: string;
}

export type SessionAttentionRollup = Record<SessionPrimaryState, number>;

const EMPTY_SESSION_ATTENTION_ROLLUP: SessionAttentionRollup = {
  "pending-approval": 0,
  "awaiting-input": 0,
  "plan-ready": 0,
  failed: 0,
  working: 0,
  connecting: 0,
  "completed-unread": 0,
  monitoring: 0,
  ready: 0,
};

function hasUnreadResult(input: SessionAttentionInput): boolean {
  if (input.resultDisposition === "settled" || input.latestResultAt === null) {
    return false;
  }
  const latestResultAt = Date.parse(input.latestResultAt);
  if (Number.isNaN(latestResultAt)) {
    return false;
  }
  if (input.resultDisposition === "unread") {
    return true;
  }
  if (input.lastVisitedAt === null) {
    return true;
  }
  const lastVisitedAt = Date.parse(input.lastVisitedAt);
  return Number.isNaN(lastVisitedAt) || latestResultAt > lastVisitedAt;
}

function derivePrimaryState(
  attentionState: SessionAttentionState,
  runtimeState: SessionRuntimeState,
): SessionPrimaryState {
  if (
    attentionState === "pending-approval" ||
    attentionState === "awaiting-input" ||
    attentionState === "plan-ready"
  ) {
    return attentionState;
  }
  if (
    runtimeState === "failed" ||
    runtimeState === "working" ||
    runtimeState === "connecting"
  ) {
    return runtimeState;
  }
  if (attentionState === "completed-unread") {
    return attentionState;
  }
  return runtimeState;
}

export function deriveSessionAttention(
  input: SessionAttentionInput,
): SessionAttentionSummary {
  let runtimeState: SessionRuntimeState = "ready";
  if (input.sessionStatus === "error") {
    runtimeState = "failed";
  } else if (input.connectionPending) {
    runtimeState = "connecting";
  } else if (input.sessionStatus === "running") {
    runtimeState =
      input.activityKind === "background" ? "monitoring" : "working";
  }
  let attentionState: SessionAttentionState = "none";
  if (input.hasPendingPermission) {
    attentionState = "pending-approval";
  } else if (input.hasPendingQuestion) {
    attentionState = "awaiting-input";
  } else if (input.hasPendingPlanApproval) {
    attentionState = "plan-ready";
  } else if (hasUnreadResult(input)) {
    attentionState = "completed-unread";
  }

  return {
    runtimeState,
    attentionState,
    primaryState: derivePrimaryState(attentionState, runtimeState),
  };
}

export function rollupSessionAttention(
  primaryStates: readonly SessionPrimaryState[],
): SessionAttentionRollup {
  const rollup = { ...EMPTY_SESSION_ATTENTION_ROLLUP };
  for (const primaryState of primaryStates) {
    rollup[primaryState] += 1;
  }
  return rollup;
}
