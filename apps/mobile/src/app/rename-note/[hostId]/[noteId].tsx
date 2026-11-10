import { useLocalSearchParams } from "expo-router";
import { useSavedHosts } from "@/hosts";
import { RenameNoteForm } from "@/notes";

export default function RenameNoteRoute() {
  const { hostId, noteId } = useLocalSearchParams<{
    hostId: string;
    noteId: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host) return null;
  return <RenameNoteForm host={host} noteId={noteId} />;
}
