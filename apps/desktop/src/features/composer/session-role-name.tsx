import { useAtomValue } from "jotai";
import { useSyncExternalStore } from "react";
import { activeSessionIdAtom, sessionsAtom } from "@/features/sessions";
import {
  getAgentRoles,
  subscribeAgentRoles,
} from "@/features/sessions/agent-role";
import { composerFooterControlClassName } from "./chat-composer-layout";

export function SessionRoleName() {
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const sessions = useAtomValue(sessionsAtom);
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const session = activeSessionId
    ? (sessions.find((item) => item.id === activeSessionId) ?? null)
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
