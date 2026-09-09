import { useAtomValue } from "jotai";
import { useSyncExternalStore } from "react";
import { activeSessionIdAtom, sessionsAtom } from "@/features/sessions";
import {
  getAgentRoles,
  subscribeAgentRoles,
} from "@/features/sessions/agent-role";
import { composerFooterControlClassName } from "./chat-composer-layout";
import { resolveComposerSessionId } from "./composer-session-id";

export function SessionRoleName({ sessionId }: { sessionId?: string | null }) {
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const sessions = useAtomValue(sessionsAtom);
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const resolvedSessionId = resolveComposerSessionId(
    sessionId,
    activeSessionId,
  );
  const session = resolvedSessionId
    ? (sessions.find((item) => item.id === resolvedSessionId) ?? null)
    : null;
  const selectedRole = session?.agentRoleId
    ? (roles.find((role) => role.id === session.agentRoleId) ?? null)
    : null;

  if (!selectedRole) {
    return null;
  }

  return (
    <span className={composerFooterControlClassName("inline-flex max-w-32")}>
      <span className="truncate font-medium">{selectedRole.name}</span>
    </span>
  );
}
