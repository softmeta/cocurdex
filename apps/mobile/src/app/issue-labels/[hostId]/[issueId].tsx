import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { IssueLabelPicker } from "@/issues";

export default function IssueLabelsRoute() {
  const { hostId, issueId } = useLocalSearchParams<{
    hostId: string;
    issueId: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <IssueLabelPicker host={host} issueId={issueId} />;
}
