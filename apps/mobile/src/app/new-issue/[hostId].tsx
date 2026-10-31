import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { NewIssueForm } from "@/issues";

export default function NewIssueRoute() {
  const { hostId, workspaceId } = useLocalSearchParams<{
    hostId: string;
    workspaceId?: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <NewIssueForm host={host} initialWorkspaceId={workspaceId ?? null} />;
}
