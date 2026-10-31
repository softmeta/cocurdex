import useSWR, { mutate } from "swr";
import { hostConnection } from "@/connection";

function archivedKey(hostId: string) {
  return ["session.listArchived", hostId] as const;
}

export function useArchivedSessions(hostId: string) {
  return useSWR(
    archivedKey(hostId),
    ([method, host]) => hostConnection(host).request(method),
    { dedupingInterval: 0 },
  );
}

export function reloadArchivedSessions(hostId: string) {
  return mutate(archivedKey(hostId));
}
