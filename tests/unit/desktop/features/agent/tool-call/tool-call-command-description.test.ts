import { describe, expect, it } from "vitest";
import { getCommandDescription } from "@/features/agent/tool-call/tool-call-command-description";

describe("getCommandDescription", () => {
  it("reads the agent-written description of a shell command", () => {
    expect(
      getCommandDescription({
        rawInput: { command: "git clone a b", description: "Clone both repos" },
      }),
    ).toBe("Clone both repos");
  });

  it("reads a description nested under input", () => {
    expect(
      getCommandDescription({
        rawInput: { input: { command: "ls", description: "List agent dir" } },
      }),
    ).toBe("List agent dir");
  });

  it("collapses whitespace so the row stays on one line", () => {
    expect(
      getCommandDescription({
        rawInput: { description: "  Paseo\n  overview  " },
      }),
    ).toBe("Paseo overview");
  });

  it.each([
    [{ command: "ls -la" }],
    [{ command: "ls", description: "   " }],
    [{ command: "ls", description: 42 }],
    ["ls -la"],
    [null],
  ])("returns null without a usable description: %j", (rawInput) => {
    expect(getCommandDescription({ rawInput })).toBeNull();
  });
});
