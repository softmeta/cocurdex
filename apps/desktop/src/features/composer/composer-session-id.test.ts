import { describe, expect, it } from "vitest";
import { resolveComposerSessionId } from "./composer-session-id";

describe("resolveComposerSessionId", () => {
  it("keeps a bound pane session when the global active session changes", () => {
    expect(resolveComposerSessionId("pane-session", "other-session")).toBe(
      "pane-session",
    );
    expect(resolveComposerSessionId("pane-session", null)).toBe("pane-session");
  });

  it("does not borrow another pane's session when this composer has none", () => {
    expect(resolveComposerSessionId(null, "other-session")).toBeNull();
  });

  it("falls back to the global active session when no pane binding is passed", () => {
    expect(resolveComposerSessionId(undefined, "active-session")).toBe(
      "active-session",
    );
    expect(resolveComposerSessionId(undefined, null)).toBeNull();
  });
});
