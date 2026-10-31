import { useLocalSearchParams } from "expo-router";
import { FileScreen } from "@/files";
import { useSavedHosts } from "@/hosts";

export default function FileRoute() {
  const { hostId, path, line } = useLocalSearchParams<{
    hostId: string;
    path: string;
    line?: string;
  }>();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  if (!host || !path) return null;
  const focusLine = line ? Number(line) : null;
  return (
    <FileScreen
      key={`${hostId}:${path}:${line ?? ""}`}
      host={host}
      filePath={path}
      line={Number.isInteger(focusLine) ? focusLine : null}
    />
  );
}
