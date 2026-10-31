import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { IssueScreen } from "@/issues";

export default function IssueRoute() {
  const { hostId, issueId } = useLocalSearchParams<{
    hostId: string;
    issueId: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return (
    <IssueScreen key={`${hostId}:${issueId}`} host={host} issueId={issueId} />
  );
}
