import {
  type AgentId,
  type AgentPermissionMode,
  type AgentPermissionModeOption,
  type AgentRoleRecord,
  childPermissionMode,
  type SessionRecord,
} from "@cocurdex/shared";

export interface ChildSessionInput {
  id: string;
  parent: SessionRecord;
  sessionKind: "teammate" | "subagent";
  title: string;
  agentType: AgentId;
  role: AgentRoleRecord | null;
  worktreePath: string | null;
  now: string;
  permissionModes: {
    parent: readonly AgentPermissionModeOption[];
    child: readonly AgentPermissionModeOption[];
  };
}

export interface ChildSession {
  session: SessionRecord;
  permissionLimitedTo: AgentPermissionMode | null;
}

export function buildChildSession(input: ChildSessionInput): ChildSession {
  const { parent, role, agentType } = input;
  const requested =
    role?.permissionMode ??
    (agentType === parent.agentType ? parent.permissionMode : null) ??
    null;
  const permission = childPermissionMode(
    {
      agentId: parent.agentType,
      permissionMode: parent.permissionMode ?? null,
      options: input.permissionModes.parent,
    },
    {
      agentId: agentType,
      permissionMode: requested,
      options: input.permissionModes.child,
    },
  );
  return {
    session: {
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
      permissionMode: permission.permissionMode ?? undefined,
      agentRoleId: role?.id ?? null,
      providerSnapshot:
        agentType === parent.agentType
          ? (parent.providerSnapshot ?? null)
          : null,
      createdAt: input.now,
      updatedAt: input.now,
      lastMessageAt: null,
      archivedAt: null,
      worktreePath: input.worktreePath,
    },
    permissionLimitedTo: permission.limitedTo,
  };
}
