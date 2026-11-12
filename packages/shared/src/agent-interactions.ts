import type { AgentId } from "./agent-identity";
import type { AgentToolCallLocation } from "./agent-tool-call-contracts";

export type AgentPermissionDecision =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always"
  | "cancelled";
export type AgentPermissionOptionKind = Exclude<
  AgentPermissionDecision,
  "cancelled"
>;
export interface AgentPermissionOption {
  id: string;
  kind: AgentPermissionOptionKind;
  label: string;
  labelSource: "generic" | "provider";
}

export interface AgentPermissionResolution {
  decision: AgentPermissionDecision;
  optionId: string | null;
}
export type AgentPermissionStatus = "pending" | "allowed" | "denied";

export interface AgentPermissionAccess {
  operation: "edit" | "read" | "use" | "write";
  path: string | null;
}

export interface AgentPermissionRequestRecord {
  id: string;
  sessionId: string;
  providerId: AgentId;
  kind: string;
  title: string;
  description?: string | null;
  rawInput?: unknown;
  rawInputVisible?: boolean;
  access?: AgentPermissionAccess;
  locations: AgentToolCallLocation[];
  options: AgentPermissionOption[];
  status: AgentPermissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPermissionRequestPayload {
  id?: string;
  sessionId: string;
  providerId: AgentId;
  kind: string;
  title: string;
  description?: string | null;
  rawInput?: unknown;
  rawInputVisible?: boolean;
  access?: AgentPermissionAccess;
  locations?: AgentToolCallLocation[];
  options: AgentPermissionOption[];
}

export interface AgentPermissionRequestedEvent {
  type: "permission.requested";
  sessionId: string;
  request: AgentPermissionRequestRecord;
}

export interface AgentPermissionResolvedEvent {
  type: "permission.resolved";
  sessionId: string;
  request: AgentPermissionRequestRecord;
  decision: AgentPermissionDecision;
}

export type AgentQuestionStatus = "pending" | "answered";

export interface AgentQuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface AgentQuestionPrompt {
  header?: string;
  options?: AgentQuestionOption[];
  multiSelect?: boolean;
}

export interface AgentQuestionRequestRecord {
  id: string;
  sessionId: string;
  providerId: AgentId;
  question: string;
  header?: string;
  options?: AgentQuestionOption[];
  multiSelect?: boolean;
  status: AgentQuestionStatus;
  answer?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentQuestionRequestPayload {
  id?: string;
  sessionId: string;
  providerId: AgentId;
  question: string;
  header?: string;
  options?: AgentQuestionOption[];
  multiSelect?: boolean;
}

export interface AgentQuestionRequestedEvent {
  type: "question.requested";
  sessionId: string;
  question: AgentQuestionRequestRecord;
}

export interface AgentQuestionResolvedEvent {
  type: "question.resolved";
  sessionId: string;
  question: AgentQuestionRequestRecord;
}

export type AgentPlanApprovalOutcome = "approved" | "cancelled" | "abandoned";
export type AgentPlanApprovalStatus = "pending" | "resolved" | "stale";
export type AgentPlanApprovalSource = "inline" | "file-backed";

export interface AgentPlanApprovalRecord {
  id: string;
  sessionId: string;
  providerId: AgentId;
  planContent: string | null;
  source: AgentPlanApprovalSource;
  status: AgentPlanApprovalStatus;
  outcome?: AgentPlanApprovalOutcome | null;
  feedback?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPlanApprovalRequestPayload {
  id?: string;
  sessionId: string;
  providerId: AgentId;
  planContent: string | null;
  source: AgentPlanApprovalSource;
}

export interface AgentPlanApprovalDecision {
  outcome: AgentPlanApprovalOutcome;
  feedback?: string | null;
}

export interface AgentPlanApprovalRequestedEvent {
  type: "plan.approval.requested";
  sessionId: string;
  approval: AgentPlanApprovalRecord;
}

export interface AgentPlanApprovalResolvedEvent {
  type: "plan.approval.resolved";
  sessionId: string;
  approval: AgentPlanApprovalRecord;
}

export interface AgentPlanStep {
  step: string;
  status: "pending" | "in_progress" | "completed";
}

export interface AgentSessionPlan {
  explanation?: string | null;
  steps: AgentPlanStep[];
  updatedAt: string;
}

export interface AgentPlanUpdatedEvent {
  type: "plan.updated";
  sessionId: string;
  plan: AgentSessionPlan;
}
