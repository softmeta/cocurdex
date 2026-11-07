import { useLocalSearchParams } from "expo-router";
import { AssistantOverview } from "@/assistant";
import { useSavedHosts } from "@/hosts";

export default function AssistantOverviewRoute() {
  const { hostId, agentId } = useLocalSearchParams<{
    hostId: string;
    agentId: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <AssistantOverview host={host} agentId={agentId} />;
}
