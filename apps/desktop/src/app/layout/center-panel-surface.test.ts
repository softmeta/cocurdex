import { describe, expect, it } from "vitest";
import {
  resolveCenterPanelSurface,
  resolvePaneCenterSurface,
} from "./center-panel-surface";

describe("resolveCenterPanelSurface", () => {
  it("shows the chat composer when the chat tab is open, even with a workspace session selected", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "chat",
        hasConversation: false,
        hasSession: true,
        sessionDataLoaded: true,
      }),
    ).toBe("new-conversation");
  });

  it("keeps an open conversation on the chat tab", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "chat",
        hasConversation: true,
        hasSession: true,
        sessionDataLoaded: true,
      }),
    ).toBe("conversation");
  });

  it("shows the agent composer on the projects tab with no session", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "projects",
        hasConversation: false,
        hasSession: false,
        sessionDataLoaded: false,
      }),
    ).toBe("new-session");
  });

  it("does not keep a conversation on the projects tab", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "projects",
        hasConversation: true,
        hasSession: false,
        sessionDataLoaded: false,
      }),
    ).toBe("new-session");
  });

  it("shows the loaded agent session on the projects tab", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "projects",
        hasConversation: false,
        hasSession: true,
        sessionDataLoaded: true,
      }),
    ).toBe("agent-session");
  });

  it("waits for agent session data on the projects tab", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "projects",
        hasConversation: true,
        hasSession: true,
        sessionDataLoaded: false,
      }),
    ).toBe("agent-session-loading");
  });
});

describe("resolvePaneCenterSurface", () => {
  it("follows the sidebar tab when only one pane is open", () => {
    expect(
      resolvePaneCenterSurface({
        sidebarTab: "chat",
        paneCount: 1,
        conversationId: null,
        sessionId: "session-1",
        hasConversation: false,
        hasSession: true,
        sessionDataLoaded: true,
      }),
    ).toBe("new-conversation");
  });

  it("keeps a session visible in a split pane while the chat tab is selected", () => {
    expect(
      resolvePaneCenterSurface({
        sidebarTab: "chat",
        paneCount: 2,
        conversationId: null,
        sessionId: "session-1",
        hasConversation: false,
        hasSession: true,
        sessionDataLoaded: true,
      }),
    ).toBe("agent-session");
  });

  it("shows a new session in an empty split pane on the projects tab", () => {
    expect(
      resolvePaneCenterSurface({
        sidebarTab: "projects",
        paneCount: 2,
        conversationId: null,
        sessionId: null,
        hasConversation: false,
        hasSession: false,
        sessionDataLoaded: false,
      }),
    ).toBe("new-session");
  });
});
