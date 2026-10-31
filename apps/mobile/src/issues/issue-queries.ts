import useSWR from "swr";
import { hostConnection } from "@/connection";

const DAEMON_READ = { dedupingInterval: 0 };
const CACHED_READ = { ...DAEMON_READ, revalidateIfStale: false };

export function useIssueView(hostId: string, { cached = false } = {}) {
  return useSWR(
    ["issue.loadView", hostId] as const,
    ([method, host]) => hostConnection(host).request(method, {}),
    cached ? CACHED_READ : DAEMON_READ,
  );
}

export function useIssueDetail(hostId: string, issueId: string) {
  return useSWR(
    ["issue.getDetail", hostId, issueId] as const,
    ([method, host, id]) => hostConnection(host).request(method, { id }),
    DAEMON_READ,
  );
}
