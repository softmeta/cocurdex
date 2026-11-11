import type { AgentId, RunStatus } from "./contracts";

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

export type DelegatedWorkOutcome =
  | "finished"
  | "failed"
  | "cancelled"
  | "interrupted";

const OUTCOME_BY_RUN_STATUS: Record<
  Exclude<RunStatus, "running">,
  DelegatedWorkOutcome
> = {
  completed: "finished",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "interrupted",
};

const OUTCOME_HEADERS: Record<DelegatedWorkOutcome, string> = {
  finished: "finished its turn",
  failed: "failed",
  cancelled: "was cancelled",
  interrupted: "was interrupted",
};

export function delegatedWorkOutcome(status: RunStatus): DelegatedWorkOutcome {
  return status === "running" ? "interrupted" : OUTCOME_BY_RUN_STATUS[status];
}

export function delegatedWorkReportMessageId(runId: string) {
  return `delegation-report-${runId}`;
}

export function renderDelegatedWorkBriefing(
  personaName: string,
  prompt: string,
) {
  return `[Task from the personal assistant "${personaName}". Your final reply is reported back to it.]\n${prompt}`;
}

export function renderDelegatedWorkReport(input: {
  title: string;
  outcome: DelegatedWorkOutcome;
  error: string | null;
  reply: string | null;
}) {
  const header = `[Work session "${input.title}" you delegated ${OUTCOME_HEADERS[input.outcome]}. Tell the user what happened and what, if anything, they should review or decide; they can open the session from this message.]`;
  const body = [input.error ? `Error: ${input.error}` : "", input.reply ?? ""]
    .filter(Boolean)
    .join("\n\n");
  return body ? `${header}\n${body}` : header;
}
