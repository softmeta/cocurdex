import type { SessionRecord } from "@cocurdex/shared";
import { atom } from "jotai";
import { requestChatDockVisibility } from "@/app/layout/chat-dock-geometry";
import { selectSessionAtom, upsertSessionAtom } from "@/features/sessions";
import { desktopApi } from "@/lib";

// Binds the workspace's assistant session to the focused chat pane and reveals
// the shared chat dock, so callers can follow up with a kickoff message.
function assistantSessionAtom(
  load: (workspaceId: string) => Promise<SessionRecord>,
) {
  return atom(null, async (_get, set, workspaceId: string) => {
    const session = await load(workspaceId);
    set(upsertSessionAtom, session);
    set(selectSessionAtom, session.id);
    requestChatDockVisibility("open");
    return session;
  });
}

export const openAssistantSessionAtom = assistantSessionAtom((workspaceId) =>
  desktopApi.getOrCreateAssistantSession(workspaceId),
);

export const newAssistantSessionAtom = assistantSessionAtom((workspaceId) =>
  desktopApi.createAssistantSession(workspaceId),
);
