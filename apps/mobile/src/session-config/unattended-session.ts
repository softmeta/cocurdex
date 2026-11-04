import type { SavedHost } from "@cocurdex/client-runtime";
import {
  sessionRunsUnattended,
  UNATTENDED_EXECUTION_SCOPE,
} from "@cocurdex/shared";
import { useAgents } from "@/agents";
import { useViewedSession } from "@/sessions";
import { useSessionRuntimeState } from "./runtime-state";

export function useNeedsExecuteToDrive(host: SavedHost, sessionId: string) {
  const viewed = useViewedSession(host.hostId, sessionId);
  const session = viewed.sessions.find((entry) => entry.id === sessionId);
  const agents = useAgents(host.hostId).data ?? [];
  const live = useSessionRuntimeState(host.hostId, sessionId);
  if (host.scopes.includes(UNATTENDED_EXECUTION_SCOPE) || !session) {
    return false;
  }
  const agent = agents.find((entry) => entry.id === session.agentType);
  return sessionRunsUnattended(
    session,
    agent?.capabilities.permissionModes ?? [],
    live,
  );
}
