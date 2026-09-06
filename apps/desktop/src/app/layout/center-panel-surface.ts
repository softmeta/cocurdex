import type { SidebarTab } from "./sidebar/sidebar-tab-store";

export type CenterPanelSurface =
  | "conversation"
  | "agent-session"
  | "agent-session-loading"
  | "new-session"
  | "new-conversation";

export function resolveCenterPanelSurface(input: {
  sidebarTab: SidebarTab;
  hasConversation: boolean;
  hasSession: boolean;
  sessionDataLoaded: boolean;
}): CenterPanelSurface {
  if (input.sidebarTab === "chat") {
    return input.hasConversation ? "conversation" : "new-conversation";
  }

  if (input.hasSession) {
    return input.sessionDataLoaded ? "agent-session" : "agent-session-loading";
  }

  return "new-session";
}
