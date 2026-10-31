import { isChatSession, type SessionRecord } from "@cocurdex/shared";

export function canSwitchSessionAgent(
  session: SessionRecord,
  displayStatus: SessionRecord["status"] | undefined,
) {
  if (isChatSession(session) || session.archivedAt) return false;
  return session.status !== "running" && displayStatus !== "running";
}
