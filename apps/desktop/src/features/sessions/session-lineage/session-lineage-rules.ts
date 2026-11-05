import {
  isChatSession,
  isPersonalSession,
  type SessionRecord,
} from "@cocurdex/shared";

export function canSwitchSessionAgent(
  session: SessionRecord,
  displayStatus: SessionRecord["status"] | undefined,
) {
  if (isChatSession(session) || isPersonalSession(session)) return false;
  if (session.archivedAt) return false;
  return session.status !== "running" && displayStatus !== "running";
}
