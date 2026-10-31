import useSWR from "swr";
import { hostConnection } from "@/connection";

const DAEMON_READ = { dedupingInterval: 0 };

export function useAgentLabels(hostId: string) {
  const { data } = useSWR(
    ["agent.list", hostId] as const,
    ([method, host]) => hostConnection(host).request(method),
    DAEMON_READ,
  );
  return new Map((data ?? []).map((agent) => [agent.id, agent.label]));
}
