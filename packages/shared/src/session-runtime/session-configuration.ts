import type { SessionRecord } from "../contracts";
import type { SessionConfiguration } from "../task-control/types";

export function sessionConfigurationOf(
  session: SessionRecord,
): SessionConfiguration {
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    title: session.title,
    agentType: session.agentType,
    writeMode: session.writeMode,
    sessionModeId: session.sessionModeId,
    permissionMode: session.permissionMode,
    agentRoleId: session.agentRoleId,
    providerSnapshot: session.providerSnapshot,
    worktreePath: session.worktreePath,
    peerInbound: session.peerInbound,
    sessionKind: session.sessionKind,
  };
}
