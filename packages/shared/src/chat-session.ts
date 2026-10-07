import type { AgentId, SessionRecord } from "./contracts";

export const CHAT_WORKSPACE_ID = "chat";
export const CHAT_AGENT_ID: AgentId = "pi";

export function isChatWorkspaceId(workspaceId: string) {
  return workspaceId === CHAT_WORKSPACE_ID;
}

export function isChatSession(session: Pick<SessionRecord, "sessionKind">) {
  return session.sessionKind === "chat";
}
