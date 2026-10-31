import type { SessionConfiguration, SessionRecord } from "@cocurdex/shared";
import {
  CHAT_AGENT_ID,
  isChatSession,
  isChatWorkspaceId,
  validateSessionConfiguration,
} from "@cocurdex/shared";

function assertChatSessionShape(session: SessionRecord) {
  const chat = isChatSession(session);
  if (chat !== isChatWorkspaceId(session.workspaceId)) {
    throw new Error("Chat sessions must live in the chat workspace");
  }
  if (!chat) return;
  if (session.agentType !== CHAT_AGENT_ID)
    throw new Error("Chat sessions must use the Pi agent");
  if (session.worktreePath)
    throw new Error("Chat sessions cannot use a worktree");
}

export function applySessionConfiguration(
  input: SessionConfiguration,
  existing: SessionRecord | null,
  now: string,
): SessionRecord {
  validateSessionConfiguration(input);
  if (existing && existing.workspaceId !== input.workspaceId) {
    throw new Error("A session cannot change its workspace");
  }
  if (
    existing &&
    input.sessionKind !== undefined &&
    input.sessionKind !== (existing.sessionKind ?? "main")
  ) {
    throw new Error("A session cannot change its kind");
  }
  if (existing?.archivedAt)
    throw new Error("Restore the session before changing its configuration");
  const session: SessionRecord = {
    status: "idle",
    createdAt: now,
    lastMessageAt: null,
    ...existing,
    ...input,
    updatedAt: now,
  };
  assertChatSessionShape(session);
  return session;
}
