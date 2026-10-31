import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { RenameSessionForm } from "@/sessions";

export default function RenameSessionRoute() {
  const { hostId, sessionId } = useLocalSearchParams<{
    hostId: string;
    sessionId: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <RenameSessionForm host={host} sessionId={sessionId} />;
}
