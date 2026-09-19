import { describe, expect, it } from "vitest";
import { sessionPaneTitle } from "./session-pane-title";

const pane = {
  id: "pane-1",
  sessionId: "session-1",
  conversationId: "conversation-1",
};

describe("sessionPaneTitle", () => {
  it("prefers the conversation title", () => {
    expect(
      sessionPaneTitle(
        pane,
        [{ id: "conversation-1", title: "Conversation" }],
        [{ id: "session-1", title: "Session" }],
      ),
    ).toBe("Conversation");
  });

  it("falls back to the session title", () => {
    expect(
      sessionPaneTitle(
        pane,
        [{ id: "conversation-1", title: null }],
        [{ id: "session-1", title: "Session" }],
      ),
    ).toBe("Session");
  });

  it("returns no title for an unbound or untitled pane", () => {
    expect(sessionPaneTitle(null, [], [])).toBe("");
    expect(
      sessionPaneTitle(
        { id: "pane-1", sessionId: null, conversationId: null },
        [{ id: "conversation-1", title: "Conversation" }],
        [{ id: "session-1", title: "Session" }],
      ),
    ).toBe("");
  });
});
