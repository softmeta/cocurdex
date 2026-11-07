import { useLocalSearchParams } from "expo-router";
import { AssistantForm } from "@/assistant";
import { useSavedHosts } from "@/hosts";

export default function AssistantFormRoute() {
  const { hostId, agentId } = useLocalSearchParams<{
    hostId: string;
    agentId?: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <AssistantForm host={host} agentId={agentId ?? null} />;
}
