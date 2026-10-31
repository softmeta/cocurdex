import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { SessionSaveRole } from "@/session-config";

export default function SessionSaveRoleRoute() {
  const { hostId, sessionId } = useLocalSearchParams<{
    hostId: string;
    sessionId: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <SessionSaveRole host={host} sessionId={sessionId} />;
}
