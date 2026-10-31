import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { ArchivedSessionsScreen } from "@/settings";

export default function ArchivedRoute() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <ArchivedSessionsScreen host={host} />;
}
