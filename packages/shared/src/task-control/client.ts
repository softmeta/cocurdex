import type { SessionRecord } from "../contracts";
import type { SessionConfiguration } from "./types";

export function sessionConfiguration(
  session: SessionRecord,
): SessionConfiguration {
  const {
    id,
    workspaceId,
    title,
    agentType,
    writeMode,
    sessionModeId,
    permissionMode,
    agentRoleId,
    providerSnapshot,
    worktreePath,
    peerInbound,
  } = session;
  return {
    id,
    workspaceId,
    title,
    agentType,
    writeMode,
    sessionModeId,
    permissionMode,
    agentRoleId,
    providerSnapshot,
    worktreePath,
    ...(peerInbound ? { peerInbound } : {}),
  };
}
