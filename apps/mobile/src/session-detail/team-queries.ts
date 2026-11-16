import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import useSWRSubscription from "swr/subscription";
import { hostConnection } from "@/connection";

function changesTeam(event: CocurdexDaemonEvent, leadSessionId: string) {
  if (event.type === "team.changed") {
    return event.leadSessionId === leadSessionId;
  }
  return event.type === "data.changed" && event.areas.includes("agent");
}

/** The team a session leads, reloaded whenever the daemon reports a change to it. */
export function useLeadTeam(
  hostId: string,
  leadSessionId: string,
  enabled: boolean,
) {
  return useSWRSubscription(
    enabled ? (["team.get", hostId, leadSessionId] as const) : null,
    ([method, host, sessionId], { next }) => {
      const connection = hostConnection(host);
      const load = () =>
        connection.request(method, { leadSessionId: sessionId }).then(
          (snapshot) => next(null, snapshot),
          (error: unknown) => next(error as Error),
        );
      void load();
      const stopEvents = connection.onEvent((event) => {
        if (changesTeam(event, sessionId)) void load();
      });
      const stopState = connection.subscribeState((state) => {
        if (state.status === "live") void load();
      });
      return () => {
        stopEvents();
        stopState();
      };
    },
  );
}
