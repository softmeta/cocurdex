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
 * Whether a session runs on the durable pi harness: assistant (personal) and chat sessions on pi.
 * Work sessions keep pi's coding agent.
 */
export function runsOnDurablePi(
  session: Pick<SessionRecord, "agentType" | "sessionKind">,
) {
  return (
    session.agentType === "pi" &&
    (session.sessionKind === "personal" || session.sessionKind === "chat")
  );
}
