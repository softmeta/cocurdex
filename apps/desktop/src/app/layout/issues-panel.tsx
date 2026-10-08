import { useAtomValue } from "jotai";
import { IssuesView } from "@/features/issues";
import { sessionsAtom } from "@/features/sessions";

export function IssuesPanel() {
  const sessions = useAtomValue(sessionsAtom);
  return <IssuesView sessions={sessions} />;
}
