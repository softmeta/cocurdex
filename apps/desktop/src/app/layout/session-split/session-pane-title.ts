import type { SessionPaneBinding } from "@/features/sessions";

interface TitledItem {
  id: string;
  title?: string | null;
}

/** Conversation titles win over session titles; empty when neither is titled. */
export function sessionPaneTitle(
  pane: SessionPaneBinding | null | undefined,
  conversations: readonly TitledItem[],
  sessions: readonly TitledItem[],
): string {
  if (!pane) {
    return "";
  }
  if (pane.conversationId) {
    const conversation = conversations.find(
      (item) => item.id === pane.conversationId,
    );
    if (conversation?.title) {
      return conversation.title;
    }
  }
  if (pane.sessionId) {
    const session = sessions.find((item) => item.id === pane.sessionId);
    if (session?.title) {
      return session.title;
    }
  }
  return "";
}
