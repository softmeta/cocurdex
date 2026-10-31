import { hostConnection } from "@/connection";
import { sessionsStore, useHostSessions } from "@/sessions";

export function useUnreadSessionIds(hostId: string) {
  return useHostSessions(hostId)
    .attention.filter((item) => item.primaryState === "completed-unread")
    .map((item) => item.sessionId);
}

export async function markSessionsRead(
  hostId: string,
  sessionIds: readonly string[],
) {
  const at = new Date().toISOString();
  const connection = hostConnection(hostId);
  await Promise.allSettled(
    sessionIds.map((sessionId) =>
      connection.request("attention.update", {
        sessionId,
        action: "visited",
        at,
      }),
    ),
  );
  void sessionsStore(hostId).reload();
}
