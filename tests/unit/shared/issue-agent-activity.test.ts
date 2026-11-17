import { issueAgentActivity, type SessionPrimaryState } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function lookup(states: Record<string, SessionPrimaryState>) {
  return (sessionId: string) => states[sessionId];
}

describe("issueAgentActivity", () => {
  it("needs you when any linked session waits on the person, even if another works", () => {
    const activity = issueAgentActivity(
      ["a", "b"],
      lookup({ a: "working", b: "pending-approval" }),
    );
    expect(activity).toBe("needsYou");
  });

  it("is working when a linked session runs and none waits on the person", () => {
    expect(
      issueAgentActivity(["a", "b"], lookup({ a: "ready", b: "monitoring" })),
    ).toBe("working");
  });

  it("is quiet for settled, unknown, or missing sessions", () => {
    expect(issueAgentActivity(["a", "gone"], lookup({ a: "ready" }))).toBe(
      null,
    );
    expect(issueAgentActivity([], lookup({}))).toBe(null);
  });
});
