import { describe, expect, it } from "vitest";
import { resolveCenterPanelSurface } from "./center-panel-surface";

describe("resolveCenterPanelSurface", () => {
  it("shows a bound chat session on either tab", () => {
    for (const sidebarTab of ["chat", "workspaces"] as const) {
      expect(
        resolveCenterPanelSurface({
          sidebarTab,
          sessionId: "chat-1",
          session: { sessionKind: "chat" },
          sessionDataLoaded: false,
        }),
      ).toBe("chat-session");
    }
  });

  it("keeps a bound agent session visible while the chat tab is selected", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "chat",
        sessionId: "session-1",
        session: { sessionKind: "main" },
        sessionDataLoaded: true,
      }),
    ).toBe("agent-session");
  });

  it("waits for agent session data before showing the transcript", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "workspaces",
        sessionId: "session-1",
        session: { sessionKind: "main" },
        sessionDataLoaded: false,
      }),
    ).toBe("agent-session-loading");
  });

  it("picks the empty surface from the visible tab", () => {
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "chat",
        sessionId: null,
        session: null,
        sessionDataLoaded: false,
      }),
    ).toBe("new-chat");
    expect(
      resolveCenterPanelSurface({
        sidebarTab: "workspaces",
        sessionId: null,
        session: null,
        sessionDataLoaded: false,
      }),
    ).toBe("new-session");
  });
});
