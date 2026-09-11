import { describe, expect, it } from "vitest";
import { resolveComposerSessionId } from "./composer-session-id";

describe("resolveComposerSessionId", () => {
  it("keeps the bound pane session", () => {
    expect(resolveComposerSessionId("pane-session")).toBe("pane-session");
  });

  it("does not borrow another pane's session when this composer has none", () => {
    expect(resolveComposerSessionId(null)).toBeNull();
    expect(resolveComposerSessionId(undefined)).toBeNull();
  });
});
