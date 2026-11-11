import type { RemoteHostStatus } from "@cocurdex/shared";
import useSWR from "swr";
import { desktopApi, requestDaemon, useMountEffect } from "@/lib";

const REMOTE_HOSTS_KEY = ["host.remotes.list"] as const;
const UNCONNECTED_REFRESH_MS = 3_000;
const AWAITING = new Set<RemoteHostStatus>(["unknown", "pending", "offline"]);

export function useRemoteHosts() {
  const query = useSWR(
    REMOTE_HOSTS_KEY,
    () => requestDaemon("host.remotes.list"),
    {
      dedupingInterval: 0,
      refreshInterval: (hosts) =>
        hosts?.some((host) => AWAITING.has(host.status))
          ? UNCONNECTED_REFRESH_MS
          : 0,
    },
  );
  const { mutate } = query;
  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.includes("settings")) void mutate();
    }),
  );
  return query;
}
