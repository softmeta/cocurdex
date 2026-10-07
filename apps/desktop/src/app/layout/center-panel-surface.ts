import type { SessionRecord } from "@cocurdex/shared";
import { isChatSession } from "@cocurdex/shared";
import type { SidebarTab } from "./sidebar/sidebar-tab-store";

export type CenterPanelSurface =
  | "chat-session"
  | "agent-session"
  | "agent-session-loading"
  | "new-session"
  | "new-chat";

export function resolveCenterPanelSurface(input: {
  sidebarTab: SidebarTab;
  sessionId: string | null;
  session: Pick<SessionRecord, "sessionKind"> | null;
  sessionDataLoaded: boolean;
}): CenterPanelSurface {
  if (input.session) {
    if (isChatSession(input.session)) {
      return "chat-session";
    }
    return input.sessionDataLoaded ? "agent-session" : "agent-session-loading";
  }
  if (input.sessionId) {
    return "new-session";
  }
  return input.sidebarTab === "chat" ? "new-chat" : "new-session";
}
