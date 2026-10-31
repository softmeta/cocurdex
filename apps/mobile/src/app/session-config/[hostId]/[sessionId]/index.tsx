import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { SessionConfigScreen } from "@/session-config";

export default function SessionConfigRoute() {
  const { hostId, sessionId } = useLocalSearchParams<{
    hostId: string;
    sessionId: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <SessionConfigScreen host={host} sessionId={sessionId} />;
}
