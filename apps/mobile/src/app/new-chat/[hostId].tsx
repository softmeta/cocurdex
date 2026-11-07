import { useLocalSearchParams } from "expo-router";
import { NewChatForm } from "@/chat";
import { useSavedHosts } from "@/hosts";

export default function NewChatRoute() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  return host ? <NewChatForm key={host.hostId} host={host} /> : null;
}
