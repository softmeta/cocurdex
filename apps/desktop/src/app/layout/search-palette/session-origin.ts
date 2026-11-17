import {
  type AgentRoleRecord,
  isChatSession,
  isPersonalSession,
  type SessionRecord,
} from "@cocurdex/shared";
import { useMemo } from "react";
import { usePersonalAgents } from "@/features/personal";

export type SessionOrigin =
  | { kind: "work"; workspaceName: string | undefined }
  | { kind: "chat" }
  | { kind: "assistant"; role: AgentRoleRecord | undefined };

export function usePersonaRoles(): ReadonlyMap<string, AgentRoleRecord> {
  const { agents } = usePersonalAgents();
  return useMemo(
    () => new Map(agents.map((agent) => [agent.role.id, agent.role])),
    [agents],
  );
}

export function sessionOrigin(
  session: SessionRecord,
  workspaceNames: ReadonlyMap<string, string>,
  personaRoles: ReadonlyMap<string, AgentRoleRecord>,
): SessionOrigin {
  if (isPersonalSession(session)) {
    const role = session.agentRoleId
      ? personaRoles.get(session.agentRoleId)
      : undefined;
    return { kind: "assistant", role };
  }
  if (isChatSession(session)) return { kind: "chat" };
  return {
    kind: "work",
    workspaceName: workspaceNames.get(session.workspaceId),
  };
}
