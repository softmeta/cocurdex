import type { SavedHost } from "@cocurdex/client-runtime";
import { SaveRoleForm } from "@/agents";
import { useSessionRoleDraft } from "./session-role-draft";

export function SessionSaveRole({
  host,
  sessionId,
}: {
  host: SavedHost;
  sessionId: string;
}) {
  const { draft, summary } = useSessionRoleDraft(host, sessionId);
  return <SaveRoleForm host={host} draft={draft} summary={summary} />;
}
