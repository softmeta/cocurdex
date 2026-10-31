import type { AgentId } from "@cocurdex/shared";
import { useAgents } from "@/agents";
import { useHostSessions } from "@/sessions";

export interface SessionAgentChoice {
  id: AgentId;
  label: string;
}

export function useSessionAgentChoices(hostId: string) {
  const snapshot = useHostSessions(hostId);
  const descriptors = useAgents(hostId).data;
  const labels = new Map<AgentId, string>(
    descriptors?.map((agent) => [agent.id, agent.label]),
  );
  const used = new Set(snapshot.sessions.map((session) => session.agentType));
  return [...used].map(
    (id): SessionAgentChoice => ({ id, label: labels.get(id) ?? id }),
  );
}
