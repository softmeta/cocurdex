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

export function resolvePaneCenterSurface(input: {
  sidebarTab: SidebarTab;
  conversationId: string | null;
  sessionId: string | null;
  hasConversation: boolean;
  hasSession: boolean;
  sessionDataLoaded: boolean;
}): CenterPanelSurface {
  if (input.conversationId) {
    return input.hasConversation ? "conversation" : "new-conversation";
  }

  if (input.sessionId) {
    if (!input.hasSession) {
      return "new-session";
    }
    return input.sessionDataLoaded ? "agent-session" : "agent-session-loading";
  }

  return resolveCenterPanelSurface({
    sidebarTab: input.sidebarTab,
    hasConversation: false,
    hasSession: false,
    sessionDataLoaded: false,
  });
}
