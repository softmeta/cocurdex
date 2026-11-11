import type { AgentId, AgentRoleRecord, SessionRecord } from "@cocurdex/shared";

export interface ChildSessionInput {
  id: string;
  parent: SessionRecord;
  sessionKind: "teammate" | "subagent";
  title: string;
  agentType: AgentId;
  role: AgentRoleRecord | null;
  worktreePath: string | null;
  now: string;
}

export function buildChildSession(input: ChildSessionInput): SessionRecord {
  const { parent, role, agentType } = input;
  return {
    id: input.id,
    workspaceId: parent.workspaceId,
    title: input.title,
    agentType,
    sessionKind: input.sessionKind,
    parentSessionId: parent.id,
    parentToolCallId: null,
    status: "idle",
    writeMode: parent.writeMode,
    sessionModeId: role?.sessionModeId ?? null,
    permissionMode: role?.permissionMode ?? parent.permissionMode,
    agentRoleId: role?.id ?? null,
    providerSnapshot:
      agentType === parent.agentType ? (parent.providerSnapshot ?? null) : null,
    createdAt: input.now,
    updatedAt: input.now,
    lastMessageAt: null,
    archivedAt: null,
    worktreePath: input.worktreePath,
  };
}
