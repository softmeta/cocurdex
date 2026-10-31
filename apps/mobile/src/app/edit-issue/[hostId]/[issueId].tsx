import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { EditIssueForm } from "@/issues";

export default function EditIssueRoute() {
  const { hostId, issueId } = useLocalSearchParams<{
    hostId: string;
    issueId: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <EditIssueForm host={host} issueId={issueId} />;
}
