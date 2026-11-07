import { usePersonalAgents } from "./assistant-queries";

export function usePersonaOfSession(hostId: string, sessionId: string) {
  const agents = usePersonalAgents(hostId).data;
  return agents?.find((agent) => agent.homeSessionId === sessionId) ?? null;
}
