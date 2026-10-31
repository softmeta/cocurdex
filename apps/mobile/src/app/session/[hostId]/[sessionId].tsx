import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { SessionDetailScreen } from "@/session-detail";

export default function SessionRoute() {
  const { hostId, sessionId } = useLocalSearchParams<{
    hostId: string;
    sessionId: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return (
    <SessionDetailScreen
      key={`${hostId}:${sessionId}`}
      host={host}
      sessionId={sessionId}
    />
  );
}
