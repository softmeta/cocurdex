import type { AgentId } from "@cocurdex/shared";
import useSWR from "swr";
import { hostConnection } from "@/connection";

const DAEMON_READ = { dedupingInterval: 0 };

export function useAgentRoles(hostId: string) {
  return useSWR(
    ["agentRole.list", hostId] as const,
    ([method, host]) => hostConnection(host).request(method),
    DAEMON_READ,
  );
}

export function useAgents(hostId: string) {
  return useSWR(
    ["agent.list", hostId] as const,
    ([method, host]) => hostConnection(host).request(method),
    DAEMON_READ,
  );
}

export function useCompatibleModels(hostId: string, agentId: AgentId | null) {
  return useSWR(
    agentId
      ? (["provider.listCompatibleForAgent", hostId, agentId] as const)
      : null,
    ([method, host, agent]) =>
      hostConnection(host).request(method, { agentId: agent }),
    DAEMON_READ,
  );
}
