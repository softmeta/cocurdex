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

  it("shows the agent composer on the workspaces tab with no session", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "workspaces",
        hasConversation: false,
        hasSession: false,
        sessionDataLoaded: false,
      }),
    ).toBe("new-session");
  });

  it("does not keep a conversation on the workspaces tab", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "workspaces",
        hasConversation: true,
        hasSession: false,
        sessionDataLoaded: false,
      }),
    ).toBe("new-session");
  });

  it("shows the loaded agent session on the workspaces tab", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "workspaces",
        hasConversation: false,
        hasSession: true,
        sessionDataLoaded: true,
      }),
    ).toBe("agent-session");
  });

  it("waits for agent session data on the workspaces tab", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "workspaces",
        hasConversation: true,
        hasSession: true,
        sessionDataLoaded: false,
      }),
    ).toBe("agent-session-loading");
  });
});

describe("resolvePaneCenterSurface", () => {
  it("keeps a bound session visible while the chat tab is selected", () => {
    expect(
      resolvePaneCenterSurface({
        sidebarTab: "chat",
        conversationId: null,
        sessionId: "session-1",
        hasConversation: false,
        hasSession: true,
        sessionDataLoaded: true,
      }),
    ).toBe("agent-session");
  });

  it("shows a new session in an empty pane on the workspaces tab", () => {
    expect(
      resolvePaneCenterSurface({
        sidebarTab: "workspaces",
        conversationId: null,
        sessionId: null,
        hasConversation: false,
        hasSession: false,
        sessionDataLoaded: false,
      }),
    ).toBe("new-session");
  });
});
