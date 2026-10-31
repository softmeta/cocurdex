import { useAtomValue } from "jotai";
import { useSyncExternalStore } from "react";
import { sessionsAtom } from "@/features/sessions";
import {
  getAgentRoles,
  subscribeAgentRoles,
} from "@/features/sessions/agent-role";
import { resolveComposerSessionId } from "./composer-session-id";

export function useSessionRole(sessionId?: string | null) {
  const sessions = useAtomValue(sessionsAtom);
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const resolvedSessionId = resolveComposerSessionId(sessionId);
  const session = resolvedSessionId
    ? (sessions.find((item) => item.id === resolvedSessionId) ?? null)
    : null;
  const role = session?.agentRoleId
    ? (roles.find((item) => item.id === session.agentRoleId) ?? null)
    : null;
  if (!session || !role) {
    return null;
  }
  return { ...role, agentId: session.agentType };
}

export type SessionRole = NonNullable<ReturnType<typeof useSessionRole>>;
