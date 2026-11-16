import type { AgentId, SessionRecord } from "./contracts";

export const CHAT_WORKSPACE_ID = "chat";
export const CHAT_AGENT_ID: AgentId = "pi";

export function isChatWorkspaceId(workspaceId: string) {
  return workspaceId === CHAT_WORKSPACE_ID;
}

export function isChatSession(session: Pick<SessionRecord, "sessionKind">) {
  return session.sessionKind === "chat";
}

/**
 * Whether a pi session's turn continues after a daemon restart. Subagent and teammate turns
 * belong to a script run or team that the restart ends, so they stop with it.
 */
export function resumesDurablePiTurn(
  session: Pick<SessionRecord, "agentType" | "sessionKind">,
) {
  return (
    session.agentType === "pi" &&
    session.sessionKind !== "subagent" &&
    session.sessionKind !== "teammate"
  );
}
