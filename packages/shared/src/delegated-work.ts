import type { AgentId, DelegationReportOutcome, RunStatus } from "./contracts";
import type { RoutineReport } from "./routine";

export type DelegatedWorkState = RunStatus | "idle" | "archived";

export type DelegatedWorkWaitingFor = "permission" | "question" | "plan";

export interface DelegatedWorkHost {
  id: string;
  name: string;
  reachable: boolean;
}

export interface RemoteWorkSnapshot {
  hostId: string;
  hostName: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  agentType: AgentId;
  agentRoleId: string | null;
  worktreePath: string | null;
}

export interface DelegatedWorkRecord {
  sessionId: string;
  personaId: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  agentType: AgentId;
  agentRoleId: string | null;
  teamTemplateId: string | null;
  worktreePath: string | null;
  state: DelegatedWorkState;
  waitingFor: DelegatedWorkWaitingFor | null;
  host: DelegatedWorkHost | null;
  createdAt: string;
  updatedAt: string;
}

export interface DelegationCatalog {
  hosts?: { id: string; name: string; status: string }[];
  workspaces: { id: string; name: string; rootPaths: string[] }[];
  agentRoles: {
    id: string;
    name: string;
    description: string | null;
    agentType: AgentId;
  }[];
  teamTemplates: {
    id: string;
    name: string;
    description: string | null;
    members: string[];
  }[];
}

export interface DelegationCatalogQuery {
  host?: string | null;
}

export interface StartDelegatedWorkPayload {
  personaId: string;
  workspace: string;
  prompt: string;
  title?: string | null;
  agentRole?: string | null;
  teamTemplate?: string | null;
  isolateWorktree?: boolean;
  host?: string | null;
  issue?: string | null;
}

export interface RemoteWorkStartPayload {
  workspace: string;
  prompt: string;
  requesterName: string;
  title?: string | null;
  agentRole?: string | null;
  isolateWorktree?: boolean;
}

export type RemoteWorkStarted = Omit<
  RemoteWorkSnapshot,
  "hostId" | "hostName"
> & { sessionId: string };

export interface RemoteWorkTarget {
  sessionId: string;
}

export interface RemoteWorkSendPayload extends RemoteWorkTarget {
  message: string;
  requesterName: string;
}

export interface RemoteWorkStatus {
  sessionId: string;
  title: string;
  state: DelegatedWorkState;
  waitingFor: DelegatedWorkWaitingFor | null;
  updatedAt: string;
  latestRun: { id: string; status: RunStatus; error: string | null } | null;
  reply: string | null;
  report?: RoutineReport | null;
}

export interface SendDelegatedWorkPayload {
  personaId: string;
  sessionId: string;
  message: string;
}

export interface DelegatedWorkTarget {
  personaId: string;
  sessionId: string;
}

const OUTCOME_BY_RUN_STATUS: Record<
  Exclude<RunStatus, "running" | "completed">,
  DelegationReportOutcome
> = {
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "interrupted",
};

const OUTCOME_HEADERS: Record<DelegationReportOutcome, string> = {
  finished: "finished its turn",
  ready: "has a result ready",
  needs_you: "needs the user to decide",
  blocked: "is blocked",
  failed: "failed",
  cancelled: "was cancelled",
  interrupted: "was interrupted",
};

export const DELEGATED_REPLY_MAX_LENGTH = 6_000;

export function delegationReportOutcome(
  status: RunStatus,
  report: RoutineReport | null,
): DelegationReportOutcome | null {
  if (status === "running") return "interrupted";
  if (status !== "completed") return OUTCOME_BY_RUN_STATUS[status];
  if (!report) return "finished";
  return report.status === "dropped" ? null : report.status;
}

export function delegatedWorkReportMessageId(runId: string) {
  return `delegation-report-${runId}`;
}

export function renderDelegatedWorkBriefing(
  personaName: string,
  prompt: string,
  canReport = false,
) {
  const reporting = canReport
    ? " Before you end each turn, call work_report once: ready with a result, dropped when there is nothing for the user, needs_you with the question they must answer, blocked or failed with why. Write its summary for the assistant: the outcome, what the user must review or decide, and what you did not verify."
    : "";
  return `[Task from the personal assistant "${personaName}". Your final reply is reported back to it.${reporting}]\n${prompt}`;
}

function shortenedReply(reply: string, readMore: string | null) {
  if (reply.length <= DELEGATED_REPLY_MAX_LENGTH) return reply;
  const note = readMore
    ? `[Reply shortened. ${readMore}]`
    : "[Reply shortened.]";
  return `${reply.slice(0, DELEGATED_REPLY_MAX_LENGTH)}\n${note}`;
}

export function renderDelegatedWorkReport(input: {
  title: string;
  sessionId: string;
  outcome: DelegationReportOutcome;
  error: string | null;
  report: RoutineReport | null;
  reply: string | null;
  readMore: string | null;
}) {
  const header = `[Work session "${input.title}" you delegated ${OUTCOME_HEADERS[input.outcome]}. The user does not see this message. Tell them in your own words what came out of it, what they must review or decide, and how sure the result is; do not retell how the work was done or repeat an outcome you already told them. Link the session as cocurdex://session/${input.sessionId}.]`;
  const report = input.report;
  const body = [
    input.error ? `Error: ${input.error}` : "",
    report ? `Summary: ${report.summary}` : "",
    report?.question ? `Question for the user: ${report.question}` : "",
    !report && input.reply ? shortenedReply(input.reply, input.readMore) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return body ? `${header}\n${body}` : header;
}
