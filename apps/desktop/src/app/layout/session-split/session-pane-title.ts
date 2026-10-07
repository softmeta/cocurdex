import type { SessionRecord } from "@cocurdex/shared";
import type { SessionPaneBinding } from "@/features/sessions";

export function sessionPaneTitle(
  pane: SessionPaneBinding | null | undefined,
  sessions: readonly Pick<SessionRecord, "id" | "title">[],
): string {
  if (!pane?.sessionId) {
    return "";
  }
  return sessions.find((item) => item.id === pane.sessionId)?.title ?? "";
}
